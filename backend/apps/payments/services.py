import logging

import stripe
from django.conf import settings
from django.db import transaction

from apps.orders.models import Order

from .models import Payment

logger = logging.getLogger(__name__)


def create_checkout_session(order: Order, *, frontend_url: str) -> stripe.checkout.Session:
    """
    Create a hosted Stripe Checkout Session for the order. Amounts are in bani,
    which is already Stripe's smallest-unit convention for RON.
    """
    stripe.api_key = settings.STRIPE_SECRET_KEY
    frontend = frontend_url.rstrip("/")

    line_items = []
    for line in order.lines.all():
        name = line.product_title
        if line.variant_name:
            name = f"{name} — {line.variant_name}"
        line_items.append({
            "price_data": {
                "currency": order.currency.lower(),
                "unit_amount": line.unit_price_amount,
                "product_data": {"name": name},
            },
            "quantity": line.quantity,
        })
    if order.shipping_amount:
        line_items.append({
            "price_data": {
                "currency": order.currency.lower(),
                "unit_amount": order.shipping_amount,
                "product_data": {"name": "Livrare"},
            },
            "quantity": 1,
        })

    return stripe.checkout.Session.create(
        mode="payment",
        line_items=line_items,
        customer_email=order.email,
        client_reference_id=order.order_number,
        metadata={"order_number": order.order_number},
        success_url=(
            f"{frontend}/checkout/success"
            f"?order={order.order_number}&session_id={{CHECKOUT_SESSION_ID}}"
        ),
        cancel_url=f"{frontend}/checkout/cancelled?order={order.order_number}",
    )


def as_dict(obj) -> dict:
    """StripeObject (SDK v15+) is not a dict and has no .get(); normalise it."""
    return obj.to_dict() if hasattr(obj, "to_dict") else dict(obj)


def retrieve_checkout_session(session_id: str) -> dict:
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return as_dict(stripe.checkout.Session.retrieve(session_id))


@transaction.atomic
def apply_checkout_session(session: dict, *, event_id: str = "", event_type: str = "") -> Payment | None:
    """
    Bring our Payment in line with what Stripe says about a Checkout Session.

    Stripe is the source of truth: a paid session marks its Payment succeeded
    even when we had cancelled it locally (the customer can return to a still
    open session) or the order was moved on by hand in the meantime.
    """
    from apps.orders.services import mark_order_paid

    payment = (
        Payment.objects.select_for_update()
        .filter(stripe_checkout_session_id=session["id"])
        .select_related("order")
        .first()
    )
    if payment is None:
        logger.warning("Stripe session %s matches no payment", session["id"])
        return None
    if event_id and payment.last_event_id == event_id:
        return payment

    if session.get("payment_status") == "paid":
        if payment.status in (Payment.Status.SUCCEEDED, Payment.Status.REFUNDED):
            return payment
        payment.status = Payment.Status.SUCCEEDED
        payment.stripe_payment_intent_id = session.get("payment_intent") or ""
    elif session.get("status") == "expired" and payment.status == Payment.Status.PENDING:
        payment.status = Payment.Status.CANCELLED
    else:
        return payment

    if event_id:
        payment.last_event_id = event_id
    payment.raw_payload = {"id": event_id or session["id"], "type": event_type or "session.sync"}
    payment.save(update_fields=[
        "status", "stripe_payment_intent_id", "last_event_id", "raw_payload", "updated_at",
    ])

    order = payment.order
    if payment.status == Payment.Status.SUCCEEDED:
        if order.paid_at is None and order.status not in (
            Order.Status.DRAFT, Order.Status.CANCELLED, Order.Status.REFUNDED,
        ):
            mark_order_paid(order)
        elif order.paid_at is None:
            logger.warning(
                "Stripe payment received for order %s in status %s; refund manually",
                order.order_number, order.status,
            )
    return payment


def sync_order_stripe_payments(order: Order) -> int:
    """Ask Stripe about every unsettled session of the order. Returns changes made."""
    changed = 0
    payments = order.payments.filter(
        provider=Payment.Provider.STRIPE,
        status__in=[Payment.Status.PENDING, Payment.Status.CANCELLED],
    ).exclude(stripe_checkout_session_id="")
    for payment in payments:
        before = payment.status
        updated = apply_checkout_session(retrieve_checkout_session(payment.stripe_checkout_session_id))
        if updated is not None and updated.status != before:
            changed += 1
    return changed


def close_pending_sessions(order: Order) -> None:
    """
    Expire still-open Stripe sessions before we stop expecting them, so a
    customer can't pay a session we consider cancelled. A session that turns
    out to be paid is applied instead of cancelled.
    """
    stripe.api_key = settings.STRIPE_SECRET_KEY
    pending = order.payments.filter(
        provider=Payment.Provider.STRIPE, status=Payment.Status.PENDING,
    )
    for payment in pending:
        session_id = payment.stripe_checkout_session_id
        if session_id:
            try:
                session = retrieve_checkout_session(session_id)
                if session.get("status") == "open":
                    session = as_dict(stripe.checkout.Session.expire(session_id))
                apply_checkout_session(session)
                continue
            except stripe.error.StripeError:
                logger.exception("Could not close Stripe session %s", session_id)
        Payment.objects.filter(pk=payment.pk, status=Payment.Status.PENDING).update(
            status=Payment.Status.CANCELLED,
        )
