import base64
import logging
from datetime import timedelta
from io import BytesIO

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from PIL import Image

from .models import Invoice, InvoiceSeries, Order, TaxConfig

logger = logging.getLogger(__name__)


def build_snapshot(order, config, *, issued_at, number_display):
    missing = [label for field, label in (
        ("legal_name", "denumire furnizor"), ("cui", "CIF furnizor"),
        ("fiscal_address", "adresă furnizor"),
    ) if not getattr(config, field).strip()]
    if missing:
        raise ValidationError("Completează datele de facturare în Setări: " + ", ".join(missing))
    billing = order.billing_address
    if billing is None or not billing.full_name or not billing.line1 or not billing.city:
        raise ValidationError("Completează adresa de facturare a clientului.")
    if billing.is_company and not (billing.company_name and billing.cui):
        raise ValidationError("Completează denumirea și CIF-ul clientului persoană juridică.")
    lines = [{
        field: getattr(line, field) for field in (
            "product_title", "variant_name", "sku", "quantity", "unit_price_amount",
            "line_total_amount", "unit_net_amount", "line_net_amount", "line_vat_amount",
            "vat_rate_bp", "vat_is_exempt", "vat_legal_mention",
        )
    } | {"unit": "BUC"} for line in order.lines.all()]
    if not lines:
        raise ValidationError("Comanda nu conține produse.")
    if (sum(line["line_net_amount"] for line in lines) + order.shipping_amount - order.discount_amount
            + order.vat_amount != order.total_amount):
        raise ValidationError("Totalurile înghețate ale comenzii nu se reconciliază. Verifică înainte de emitere.")
    seller = {field: getattr(config, field) for field in (
        "legal_name", "cui", "reg_com", "fiscal_address", "invoice_email", "invoice_phone",
        "iban", "bank", "swift", "share_capital",
    )}
    if config.invoice_logo and config.invoice_logo.file:
        with config.invoice_logo.file.open("rb") as source:
            logo = Image.open(source)
            logo.thumbnail((600, 240))
            logo = logo.convert("RGBA")
            buffer = BytesIO()
            logo.save(buffer, format="PNG")
            seller["logo_base64"] = base64.b64encode(buffer.getvalue()).decode("ascii")
    return {
        "schema_version": 2, "number_display": number_display,
        "issued_at": timezone.localtime(issued_at).date().isoformat(),
        "due_date": (timezone.localtime(issued_at).date() + timedelta(days=config.payment_term_days)).isoformat(),
        "payment_term_days": config.payment_term_days,
        "seller": seller,
        "buyer": {
            "full_name": billing.full_name, "is_company": billing.is_company,
            "company_name": billing.company_name, "cui": billing.cui, "reg_com": billing.reg_com,
            "email": order.email, "phone": order.phone or billing.phone,
            "address": ", ".join(part for part in (billing.line1, billing.line2, billing.postal_code,
                                                  billing.city, billing.county, billing.country) if part),
        },
        "order_number": order.order_number, "lines": lines, "currency": order.currency,
        "shipping_amount": order.shipping_amount, "discount_amount": order.discount_amount,
        "vat_breakdown": order.vat_breakdown, "vat_enabled": order.vat_enabled_snapshot,
        "net_amount": order.total_amount - order.vat_amount, "vat_amount": order.vat_amount,
        "gross_amount": order.total_amount, "footer": config.invoice_footer,
    }


def validate_order_for_invoice(order):
    if order.status in ("draft", "cancelled", "refunded"):
        raise ValidationError("Factura nu poate fi emisă pentru o comandă în acest status.")
    if not order.paid_at and order.status != "paid" and not order.payments.filter(provider="cash").exists():
        raise ValidationError("Comanda cu plată online trebuie achitată înainte de emitere.")


def preview_invoice(order):
    from .invoice_pdf import render_invoice_pdf
    validate_order_for_invoice(order)
    snapshot = build_snapshot(order, TaxConfig.get_solo(), issued_at=timezone.now(), number_display="PREVIZUALIZARE")
    return render_invoice_pdf(snapshot, preview=True)


@transaction.atomic
def issue_invoice(order: Order) -> Invoice:
    from .invoice_pdf import render_invoice_pdf
    order = Order.objects.select_for_update().get(pk=order.pk)
    existing = order.invoices.filter(kind=Invoice.Kind.INVOICE).first()
    if existing:
        return existing
    validate_order_for_invoice(order)
    config = TaxConfig.get_solo()
    series_qs = InvoiceSeries.objects.select_for_update().filter(is_active=True)
    series = (series_qs.filter(pk=config.default_invoice_series_id).first()
              if config.default_invoice_series_id else series_qs.order_by("pk").first())
    if series is None:
        raise ValidationError("Configurează o serie de facturare activă în Facturi / Setări.")
    issued_at = timezone.now()
    number = series.next_number
    snapshot = build_snapshot(order, config, issued_at=issued_at, number_display=f"{series.code}-{number:06d}")
    # Rendering failure rolls back numbering; SMTP is never part of this transaction.
    pdf = render_invoice_pdf(snapshot)
    invoice = Invoice.objects.create(
        order=order, kind=Invoice.Kind.INVOICE, series=series, number=number,
        issued_at=issued_at, due_date=snapshot["due_date"], currency=order.currency,
        net_amount=snapshot["net_amount"], vat_amount=order.vat_amount,
        gross_amount=order.total_amount, snapshot=snapshot, pdf_data=pdf,
    )
    series.next_number = number + 1
    series.save(update_fields=["next_number"])
    Order.objects.filter(pk=order.pk).update(invoice_error="")
    invoice.refresh_from_db()
    return invoice


def auto_issue_invoice(order_id):
    """After payment commits: configuration/PDF errors cannot undo a payment."""
    try:
        issue_invoice(Order.objects.get(pk=order_id))
    except Exception as exc:
        logger.exception("Automatic invoice failed for order %s", order_id)
        message = "; ".join(exc.messages) if isinstance(exc, ValidationError) else "Generarea facturii a eșuat. Reîncearcă din CRM."
        Order.objects.filter(pk=order_id).update(invoice_error=message)


@transaction.atomic
def get_invoice_pdf(invoice):
    from .invoice_pdf import render_invoice_pdf
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
    if invoice.pdf_data:
        return bytes(invoice.pdf_data)
    # Legacy documents only use their snapshot, never today's seller configuration.
    snapshot = dict(invoice.snapshot)
    snapshot.update(number_display=str(invoice), net_amount=invoice.net_amount,
                    vat_amount=invoice.vat_amount, gross_amount=invoice.gross_amount)
    snapshot.setdefault("issued_at", timezone.localtime(invoice.issued_at).date().isoformat())
    snapshot.setdefault("due_date", invoice.due_date.isoformat() if invoice.due_date else "")
    pdf = render_invoice_pdf(snapshot)
    invoice.pdf_data = pdf
    invoice.save(update_fields=["pdf_data"])
    return pdf
