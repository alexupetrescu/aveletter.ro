from django.db import transaction
from django.utils import timezone

from .models import Invoice, InvoiceSeries, Order, TaxConfig


@transaction.atomic
def issue_invoice(order: Order) -> Invoice:
    """
    Issue an invoice for a PAID order. Reads only the frozen numbers on the
    order/lines — never recomputes from live products. Idempotent per order:
    if a non-storno invoice already exists, return it.
    """
    existing = order.invoices.filter(kind=Invoice.Kind.INVOICE).first()
    if existing:
        return existing

    series = InvoiceSeries.objects.filter(is_active=True).first()
    if series is None:
        raise RuntimeError("No active InvoiceSeries configured.")

    number = series.reserve_number()
    tax_config = TaxConfig.get_solo()

    lines = []
    for line in order.lines.all():
        lines.append({
            "product_title": line.product_title,
            "variant_name": line.variant_name,
            "sku": line.sku,
            "quantity": line.quantity,
            "unit_price_amount": line.unit_price_amount,
            "line_total_amount": line.line_total_amount,
            "unit_net_amount": line.unit_net_amount,
            "line_net_amount": line.line_net_amount,
            "line_vat_amount": line.line_vat_amount,
            "vat_rate_bp": line.vat_rate_bp,
            "vat_is_exempt": line.vat_is_exempt,
            "vat_legal_mention": line.vat_legal_mention,
            "selected_options": line.selected_options_snapshot,
            "inputs": line.inputs_snapshot,
        })

    billing = order.billing_address
    snapshot = {
        "seller": {
            "legal_name": tax_config.legal_name if tax_config else "",
            "cui": tax_config.cui if tax_config else "",
            "reg_com": tax_config.reg_com if tax_config else "",
            "fiscal_address": tax_config.fiscal_address if tax_config else "",
        },
        "buyer": {
            "full_name": billing.full_name if billing else "",
            "email": order.email,
            "phone": order.phone,
            "address": (
                f"{billing.line1}, {billing.line2 + ', ' if billing.line2 else ''}"
                f"{billing.city}, {billing.county}, {billing.country}"
                if billing else ""
            ),
        },
        "order_number": order.order_number,
        "lines": lines,
        "shipping_amount": order.shipping_amount,
        "discount_amount": order.discount_amount,
        "vat_breakdown": order.vat_breakdown,
        "vat_enabled": order.vat_enabled_snapshot,
        "currency": order.currency,
    }

    net = order.subtotal_net_amount + order.shipping_amount - order.discount_amount
    return Invoice.objects.create(
        order=order,
        kind=Invoice.Kind.INVOICE,
        series=series,
        number=number,
        issued_at=timezone.now(),
        currency=order.currency,
        net_amount=max(0, net),
        vat_amount=order.vat_amount,
        gross_amount=order.total_amount,
        snapshot=snapshot,
    )
