import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from apps.core.frontend_url import resolve_frontend_url
from apps.core.models import format_bani
from apps.site_config.models import SiteConfig

from .models import Order

logger = logging.getLogger(__name__)

PAYMENT_LABELS = {
    "ramburs": "Plata se face ramburs, la livrare.",
    "stripe": "Plata a fost confirmată.",
}


def _format_money(amount: int, currency: str = "RON") -> str:
    return f"{format_bani(amount)} {currency}"


def _line_context(line, currency: str) -> dict:
    options = [
        f"{opt.get('group', '')}: {opt.get('label', '')}"
        for opt in (line.selected_options_snapshot or [])
        if opt.get("label")
    ]
    return {
        "product_title": line.product_title,
        "variant_name": line.variant_name,
        "quantity": line.quantity,
        "options": options,
        "unit_price": _format_money(line.unit_price_amount, currency),
        "line_total": _format_money(line.line_total_amount, currency),
    }


def _address_lines(address) -> list[str]:
    if address is None:
        return []
    lines = [address.full_name]
    if address.line1:
        lines.append(address.line1)
    if address.line2:
        lines.append(address.line2)
    city_line = ", ".join(
        part for part in [address.postal_code, address.city, address.county] if part
    )
    if city_line:
        lines.append(city_line)
    if address.phone:
        lines.append(f"Tel: {address.phone}")
    return lines


def _build_context(order: Order, *, payment_method: str) -> dict:
    site = SiteConfig.get_solo()
    currency = order.currency
    billing = order.billing_address
    shipping = order.shipping_address
    addresses_differ = (
        billing is not None
        and shipping is not None
        and billing.pk != shipping.pk
    )

    totals = [
        {"label": "Subtotal", "value": _format_money(order.subtotal_amount, currency)},
        {"label": "Livrare", "value": _format_money(order.shipping_amount, currency)},
    ]
    if order.vat_amount > 0:
        totals.append({"label": "TVA", "value": _format_money(order.vat_amount, currency)})
    totals.append({"label": "Total", "value": _format_money(order.total_amount, currency), "bold": True})

    return {
        "order": order,
        "lines": [_line_context(line, currency) for line in order.lines.all()],
        "totals": totals,
        "billing_address": billing,
        "shipping_address": shipping,
        "billing_lines": _address_lines(billing),
        "shipping_lines": _address_lines(shipping),
        "addresses_differ": addresses_differ,
        "site": site,
        "site_url": f"https://{site.domain}",
        "payment_method": payment_method,
        "payment_note": PAYMENT_LABELS.get(payment_method, ""),
    }


def send_order_confirmation_email(order: Order, *, payment_method: str) -> None:
    """Send order confirmation to the customer. Raises on SMTP failure."""
    order = (
        Order.objects.select_related("billing_address", "shipping_address")
        .prefetch_related("lines")
        .get(pk=order.pk)
    )

    context = _build_context(order, payment_method=payment_method)
    subject = f"Confirmare comandă {order.order_number} — Ave Letter"
    text_body = render_to_string(
        "orders/emails/order_confirmation.txt",
        context,
    )
    html_body = render_to_string(
        "orders/emails/order_confirmation.html",
        context,
    )

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[order.email],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send()


def send_payment_resume_email(order: Order, *, request=None) -> None:
    """Email customer a link to resume Stripe payment for an unpaid order."""
    order = (
        Order.objects.select_related("billing_address", "shipping_address")
        .prefetch_related("lines")
        .get(pk=order.pk)
    )

    frontend = resolve_frontend_url(request).rstrip("/")
    resume_url = f"{frontend}/checkout/cancelled?order={order.order_number}"

    context = _build_context(order, payment_method="stripe")
    context["resume_url"] = resume_url
    context["site_url"] = frontend

    subject = f"Reluare plată — comandă {order.order_number} — Ave Letter"
    text_body = render_to_string("orders/emails/payment_resume.txt", context)
    html_body = render_to_string("orders/emails/payment_resume.html", context)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[order.email],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send()

    Order.objects.filter(pk=order.pk).update(
        payment_resume_email_sent_at=timezone.now(),
    )
