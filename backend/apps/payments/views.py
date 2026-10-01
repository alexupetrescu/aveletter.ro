import logging

import stripe
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.frontend_url import resolve_frontend_url
from apps.orders.models import Cart, Order
from apps.orders.emails import send_order_confirmation_email, send_payment_resume_email
from apps.orders.serializers import AddressSerializer
from apps.orders.services import CheckoutError, create_order_from_cart
from apps.orders.views import _cart_key

from .models import Payment
from .services import (
    apply_checkout_session,
    as_dict,
    close_pending_sessions,
    create_checkout_session,
    retrieve_checkout_session,
)

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


def _start_stripe_payment(order: Order, *, request=None):
    """Create a Stripe Checkout Session and pending Payment for an order."""
    frontend_url = resolve_frontend_url(request)
    session = create_checkout_session(order, frontend_url=frontend_url)
    Payment.objects.create(
        order=order,
        provider=Payment.Provider.STRIPE,
        status=Payment.Status.PENDING,
        amount=order.total_amount,
        currency=order.currency,
        stripe_checkout_session_id=session.id,
    )
    send_order_confirmation_email(order, payment_method="stripe")
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
        email = serializers.EmailField(max_length=254).run_validation(email)

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
            frontend_url = resolve_frontend_url(request)
            success_url = (
                f"{frontend_url}/checkout/success"
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
            session = _start_stripe_payment(order, request=request)
        except stripe.error.StripeError:
            logger.exception("Stripe session creation failed for %s", order.order_number)
            return Response(
                {"errors": ["Eroare la procesatorul de plăți. Încearcă din nou."]},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(_stripe_checkout_response(order, session))


def _notify_checkout_cancelled(order: Order, *, request=None) -> bool:
    """
    Mark abandoned Stripe session(s) cancelled and email resume link once.
    Returns True if a resume email was sent.
    """
    if order.status != Order.Status.PENDING_PAYMENT:
        return False
    if order.payments.filter(provider__in=[Payment.Provider.CASH, Payment.Provider.BANK_TRANSFER]).exists():
        return False

    close_pending_sessions(order)
    order.refresh_from_db()
    if order.status != Order.Status.PENDING_PAYMENT or order.payment_resume_email_sent_at:
        return False

    try:
        send_payment_resume_email(order, request=request)
    except Exception:
        logger.exception(
            "Failed to send payment resume email for %s",
            order.order_number,
        )
        return False
    return True


class CheckoutCancelledNotifyView(APIView):
    """Called when the customer returns from Stripe without paying."""

    def post(self, request):
        order_number = (request.data.get("order_number") or "").strip()
        if not order_number:
            return Response(
                {"errors": ["Numărul comenzii este obligatoriu."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = get_object_or_404(Order, order_number=order_number)
        email_sent = _notify_checkout_cancelled(order, request=request)
        return Response({"email_sent": email_sent})


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
        if order.payments.filter(provider__in=[Payment.Provider.CASH, Payment.Provider.BANK_TRANSFER]).exists():
            return Response({"errors": ["Această comandă nu are plată online."]}, status=status.HTTP_400_BAD_REQUEST)

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

        close_pending_sessions(order)
        order.refresh_from_db()
        if order.status != Order.Status.PENDING_PAYMENT:
            return Response(
                {"errors": ["Comanda a fost deja plătită."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            session = _start_stripe_payment(order, request=request)
        except stripe.error.StripeError:
            logger.exception("Stripe resume failed for %s", order.order_number)
            return Response(
                {"errors": ["Eroare la procesatorul de plăți. Încearcă din nou."]},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(_stripe_checkout_response(order, session))


class CheckoutConfirmView(APIView):
    """
    Success-page return: ask Stripe directly whether the session was paid, so
    confirmation never depends on webhook delivery alone.
    """

    def post(self, request):
        order_number = (request.data.get("order_number") or "").strip()
        session_id = (request.data.get("session_id") or "").strip()
        if not order_number or not session_id.startswith("cs_"):
            return Response(
                {"errors": ["Date de confirmare invalide."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order = get_object_or_404(Order, order_number=order_number)
        if not order.payments.filter(stripe_checkout_session_id=session_id).exists():
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            apply_checkout_session(retrieve_checkout_session(session_id))
        except stripe.error.StripeError:
            logger.exception("Stripe confirm failed for %s", order_number)
            return Response(
                {"errors": ["Nu am putut verifica plata."]},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        order.refresh_from_db()
        return Response({"paid": order.paid_at is not None})


class StripeWebhookView(APIView):
    """Signature-verified, idempotent. Stripe is the source of truth for payment state."""

    def post(self, request):
        payload = request.body
        signature = request.headers.get("Stripe-Signature", "")
        try:
            event = stripe.Webhook.construct_event(
                payload, signature, settings.STRIPE_WEBHOOK_SECRET,
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            return Response(status=status.HTTP_400_BAD_REQUEST)

        if event["type"] in (
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
            "checkout.session.expired",
        ):
            self._handle_session(as_dict(event))

        return Response({"received": True})

    def _handle_session(self, event: dict):
        payment = apply_checkout_session(
            event["data"]["object"], event_id=event["id"], event_type=event["type"],
        )
        if payment is None or event["type"] != "checkout.session.expired":
            return
        order = payment.order
        if (
            payment.status != Payment.Status.CANCELLED
            or order.status != Order.Status.PENDING_PAYMENT
            or order.payment_resume_email_sent_at
            or order.payments.filter(status=Payment.Status.PENDING).exists()
        ):
            return
        try:
            send_payment_resume_email(order)
        except Exception:
            logger.exception(
                "Failed to send payment resume email for expired session %s",
                order.order_number,
            )
