import stripe
from django.conf import settings

from apps.orders.models import Order


def create_checkout_session(order: Order) -> stripe.checkout.Session:
    """
    Create a hosted Stripe Checkout Session for the order. Amounts are in bani,
    which is already Stripe's smallest-unit convention for RON.
    """
    stripe.api_key = settings.STRIPE_SECRET_KEY
    frontend = settings.FRONTEND_URL.rstrip("/")

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
