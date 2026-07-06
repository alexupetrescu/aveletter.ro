import logging

import stripe
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Cart, Order
from apps.orders.emails import send_order_confirmation_email
from apps.orders.serializers import AddressSerializer
from apps.orders.services import CheckoutError, create_order_from_cart, mark_order_paid
from apps.orders.views import _cart_key

from .models import Payment
from .services import create_checkout_session

logger = logging.getLogger(__name__)


def _stripe_checkout_response(order: Order, session) -> dict:
    return {
        "order_number": order.order_number,
        "payment_method": "stripe",
        "checkout_url": session.url,
        "subtotal_amount": order.subtotal_amount,
        "shipping_amount": order.shipping_amount,
        "total_amount": order.total_amount,
    }


def _start_stripe_payment(order: Order):
    """Create a Stripe Checkout Session and pending Payment for an order."""
    session = create_checkout_session(order)
    Payment.objects.create(
        order=order,
        provider=Payment.Provider.STRIPE,
        status=Payment.Status.PENDING,
        amount=order.total_amount,
        currency=order.currency,
        stripe_checkout_session_id=session.id,
    )
    return session


class CheckoutStartView(APIView):
    """
    Re-quotes the cart server-side, freezes the Order, then either creates a
    Stripe Checkout Session or a cash-on-delivery (ramburs) order.
    """

    def post(self, request):
        key = _cart_key(request)
        cart = Cart.objects.filter(session_key=key).first() if key else None
        if cart is None or not cart.items.exists():
            return Response(
                {"errors": ["Coșul este gol."]}, status=status.HTTP_400_BAD_REQUEST,
            )

        email = (request.data.get("email") or "").strip()
        if not email:
            return Response(
                {"errors": ["Emailul este obligatoriu."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        billing_serializer = AddressSerializer(data=request.data.get("billing_address") or {})
        if not billing_serializer.is_valid():
            return Response(
                {"errors": ["Adresa de facturare este invalidă."],
                 "field_errors": billing_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shipping_data = None
        if request.data.get("shipping_address"):
            shipping_serializer = AddressSerializer(data=request.data["shipping_address"])
            if not shipping_serializer.is_valid():
                return Response(
                    {"errors": ["Adresa de livrare este invalidă."],
                     "field_errors": shipping_serializer.errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            shipping_data = shipping_serializer.validated_data

        payment_method = (request.data.get("payment_method") or "stripe").strip().lower()
        if payment_method not in ("stripe", "ramburs"):
            return Response(
                {"errors": ["Metoda de plată selectată nu este validă."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            order = create_order_from_cart(
                cart,
                email=email,
                phone=(request.data.get("phone") or "").strip(),
                billing_address_data=billing_serializer.validated_data,
                shipping_address_data=shipping_data,
                customer_notes=(request.data.get("customer_notes") or "").strip(),
                user=request.user if request.user and request.user.is_authenticated else None,
            )
        except CheckoutError as exc:
            return Response({"errors": [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)

        cart.items.all().delete()

        if payment_method == "ramburs":
            Payment.objects.create(
                order=order,
                provider=Payment.Provider.CASH,
                status=Payment.Status.PENDING,
                amount=order.total_amount,
                currency=order.currency,
            )
            try:
                send_order_confirmation_email(order, payment_method="ramburs")
            except Exception:
                logger.exception(
                    "Failed to send order confirmation email for %s",
                    order.order_number,
                )
            success_url = (
                f"{settings.FRONTEND_URL}/checkout/success"
                f"?order={order.order_number}&payment=ramburs"
            )
            return Response({
                "order_number": order.order_number,
                "payment_method": "ramburs",
                "success_url": success_url,
                "subtotal_amount": order.subtotal_amount,
                "shipping_amount": order.shipping_amount,
                "total_amount": order.total_amount,
            })

        try:
            session = _start_stripe_payment(order)
        except stripe.error.StripeError:
            logger.exception("Stripe session creation failed for %s", order.order_number)
            return Response(
                {"errors": ["Eroare la procesatorul de plăți. Încearcă din nou."]},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(_stripe_checkout_response(order, session))


class CheckoutResumeView(APIView):
    """Create a new Stripe Checkout Session for an unpaid order."""

    def post(self, request):
        order_number = (request.data.get("order_number") or "").strip()
        if not order_number:
            return Response(
                {"errors": ["Numărul comenzii este obligatoriu."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = get_object_or_404(
            Order.objects.prefetch_related("lines"),
            order_number=order_number,
        )

        if order.status != Order.Status.PENDING_PAYMENT:
            return Response(
                {"errors": ["Comanda nu mai poate fi plătită online."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not order.lines.exists():
            return Response(
                {"errors": ["Comanda nu conține produse."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if order.payments.filter(
            provider=Payment.Provider.STRIPE,
            status=Payment.Status.SUCCEEDED,
        ).exists():
            return Response(
                {"errors": ["Comanda a fost deja plătită."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        Payment.objects.filter(
            order=order,
            provider=Payment.Provider.STRIPE,
            status=Payment.Status.PENDING,
        ).update(status=Payment.Status.CANCELLED)

        try:
            session = _start_stripe_payment(order)
        except stripe.error.StripeError:
            logger.exception("Stripe resume failed for %s", order.order_number)
            return Response(
                {"errors": ["Eroare la procesatorul de plăți. Încearcă din nou."]},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(_stripe_checkout_response(order, session))


class StripeWebhookView(APIView):
    """Signature-verified, idempotent. The only thing that marks orders paid."""

    def post(self, request):
        payload = request.body
        signature = request.headers.get("Stripe-Signature", "")
        try:
            event = stripe.Webhook.construct_event(
                payload, signature, settings.STRIPE_WEBHOOK_SECRET,
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            return Response(status=status.HTTP_400_BAD_REQUEST)

        if event["type"] == "checkout.session.completed":
            self._handle_session_completed(event)

        return Response({"received": True})

    @transaction.atomic
    def _handle_session_completed(self, event):
        session = event["data"]["object"]
        payment = (
            Payment.objects.select_for_update()
            .filter(stripe_checkout_session_id=session["id"])
            .select_related("order")
            .first()
        )
        if payment is None:
            logger.warning("Webhook for unknown checkout session %s", session["id"])
            return

        if payment.last_event_id == event["id"]:
            return
        if payment.status == Payment.Status.SUCCEEDED:
            return
        if payment.status == Payment.Status.CANCELLED:
            logger.info(
                "Ignoring webhook for cancelled session %s (order %s)",
                session["id"], payment.order.order_number,
            )
            return
        if payment.order.status != Order.Status.PENDING_PAYMENT:
            logger.info(
                "Ignoring webhook for order %s in status %s",
                payment.order.order_number, payment.order.status,
            )
            return

        payment.status = Payment.Status.SUCCEEDED
        payment.stripe_payment_intent_id = session.get("payment_intent") or ""
        payment.last_event_id = event["id"]
        payment.raw_payload = {"id": event["id"], "type": event["type"]}
        payment.save(update_fields=[
            "status", "stripe_payment_intent_id", "last_event_id",
            "raw_payload", "updated_at",
        ])

        mark_order_paid(payment.order)
