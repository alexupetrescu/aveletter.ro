"""Frozen, auditable transactional mail. Templates are text, never executable Django code."""
import re
import hashlib
from email.utils import formataddr, parseaddr

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.html import escape

from apps.core.models import format_bani
from .models import EmailTemplate, NotificationConfig, OutgoingEmail


DEFAULT_TEMPLATES = {
    "placed": ("Comandă plasată", "Am primit comanda {{order_number}}",
               "Bună, {{customer_name}}!\n\nAm primit comanda ta.\n{{items}}\n\nTotal: {{order_total}}\n{{payment_note}}\n\nÎți mulțumim!\n{{site_name}}"),
    "paid": ("Plată confirmată", "Plată confirmată — {{order_number}}",
             "Bună, {{customer_name}}!\n\nAm înregistrat plata pentru comanda {{order_number}}, în valoare de {{order_total}}.\n\n{{site_name}}"),
    "in_production": ("În producție", "Comanda {{order_number}} este în producție",
                      "Bună, {{customer_name}}!\n\nAm început lucrul la comanda ta {{order_number}}. Te anunțăm când este gata.\n\n{{site_name}}"),
    "ready_to_ship": ("Gata de livrare", "Comanda {{order_number}} este gata de livrare",
                      "Bună, {{customer_name}}!\n\nComanda ta este gata și o pregătim pentru curier.\n\n{{site_name}}"),
    "shipped": ("Expediată", "Am expediat comanda {{order_number}}",
                "Bună, {{customer_name}}!\n\nComanda a fost expediată.\nCurier: {{courier}}\nAWB: {{awb}}\nUrmărire: {{tracking_url}}\n\n{{site_name}}"),
    "completed": ("Finalizată", "Comanda {{order_number}} a fost finalizată",
                  "Bună, {{customer_name}}!\n\nComanda ta a fost finalizată. Îți mulțumim că ai ales {{site_name}}!"),
    "cancelled": ("Anulată", "Comanda {{order_number}} a fost anulată",
                  "Bună, {{customer_name}}!\n\nComanda {{order_number}} a fost anulată. Pentru întrebări ne poți răspunde la acest email.\n\n{{site_name}}"),
    "refunded": ("Rambursată", "Rambursare înregistrată — {{order_number}}",
                 "Bună, {{customer_name}}!\n\nAm înregistrat rambursarea pentru comanda {{order_number}}.\n\n{{site_name}}"),
    "staff_order": ("Notificare internă: comandă nouă", "Comandă nouă: {{order_number}}",
                    "Client: {{customer_name}}\nEmail: {{customer_email}}\n{{items}}\nTotal: {{order_total}}\n{{payment_note}}\n\n{{crm_url}}"),
    "invoice": ("Factură", "Factura {{invoice_number}} — {{order_number}}",
                "Bună, {{customer_name}}!\n\nGăsești atașată factura {{invoice_number}} pentru comanda {{order_number}}.\nTotal: {{order_total}}\nScadență: {{due_date}}\n\n{{site_name}}"),
    "payment_resume": ("Reluare plată", "Reluare plată — {{order_number}}",
                       "Bună, {{customer_name}}!\n\nPlata comenzii nu a fost finalizată. O poți relua aici:\n{{payment_url}}\n\n{{site_name}}"),
}
PLACEHOLDERS = (
    "customer_name", "customer_email", "order_number", "order_total", "items",
    "payment_note", "site_name", "awb", "courier", "tracking_url", "crm_url",
    "invoice_number", "due_date", "payment_url",
)
TOKEN = re.compile(r"{{\s*([a-z_]+)\s*}}")


def validate_template(subject, body):
    if "\n" in subject or "\r" in subject:
        raise ValidationError("Subiectul trebuie să fie pe un singur rând.")
    for text in (subject, body):
        unknown = set(TOKEN.findall(text)) - set(PLACEHOLDERS)
        remainder = TOKEN.sub("", text)
        if unknown or any(marker in remainder for marker in ("{{", "}}", "{%", "%}")):
            raise ValidationError("Folosește doar variabilele disponibile: " + ", ".join(PLACEHOLDERS))


def get_template(key):
    name, subject, body = DEFAULT_TEMPLATES[key]
    return EmailTemplate.objects.get_or_create(
        key=key, defaults={"name": name, "subject": subject, "body": body},
    )[0]


def template_context(order=None, invoice=None):
    from apps.core.frontend_url import resolve_frontend_url
    from apps.site_config.models import SiteConfig
    site = SiteConfig.get_solo()
    root = resolve_frontend_url().rstrip("/")
    context = dict.fromkeys(PLACEHOLDERS, "")
    context.update(site_name=site.site_name, customer_name="Maria Popescu",
                   customer_email="client@example.com", order_number="AVE-EXEMPLU",
                   order_total="250,00 RON", items="1 × Produs personalizat — 250,00 RON",
                   awb="123456789", courier="Curier", due_date="15.10.2026",
                   invoice_number="AVE-000001", payment_note="Plata se face ramburs, la livrare.")
    if order is not None:
        billing = order.billing_address
        cash = order.payments.filter(provider="cash").exists()
        context.update(
            customer_name=billing.full_name if billing else order.email,
            customer_email=order.email, order_number=order.order_number,
            order_total=f"{format_bani(order.total_amount)} {order.currency}",
            items="\n".join(f"{line.quantity} × {line.product_title} — {format_bani(line.line_total_amount)} {order.currency}" for line in order.lines.all()),
            payment_note=("Plata a fost confirmată." if order.paid_at else
                          "Plata se face ramburs, la livrare." if cash else
                          "Comanda așteaptă confirmarea plății online."),
            awb=order.awb, courier=order.courier, tracking_url=order.tracking_url,
            invoice_number=str(invoice) if invoice else "",
            due_date=invoice.due_date.strftime("%d.%m.%Y") if invoice and invoice.due_date else "",
        )
    context["crm_url"] = f"{root}/crm/orders/{context['order_number']}"
    context["payment_url"] = f"{root}/checkout/cancelled?order={context['order_number']}"
    return context


def render_template(template, context):
    validate_template(template.subject, template.body)
    substitute = lambda text: TOKEN.sub(lambda match: str(context[match[1]]), text)
    subject = substitute(template.subject).replace("\r", " ").replace("\n", " ")[:255]
    body = substitute(template.body)
    html = (
        '<!doctype html><html lang="ro"><body style="margin:0;background:#f7f5ef;font-family:Arial,sans-serif;color:#24241f">'
        '<div style="max-width:620px;margin:24px auto;padding:32px;background:white;border-top:4px solid #5a6437">'
        f'<h2>{escape(context["site_name"])}</h2><div style="line-height:1.7;white-space:pre-wrap">{escape(body)}</div>'
        '</div></body></html>'
    )
    return subject, body, html


def queue_email(key, *, recipient, idempotency_key, order=None, event=None,
                invoice=None, send=None, template=None):
    config = NotificationConfig.get_solo()
    template = template or get_template(key)
    subject, body, html = render_template(template, template_context(order, invoice))
    enabled = template.enabled if send is None else send
    return OutgoingEmail.objects.get_or_create(idempotency_key=idempotency_key, defaults={
        "template_key": key, "order": order, "event": event, "invoice": invoice,
        "recipient": recipient, "subject": subject, "body": body, "html_body": html,
        "from_email": formataddr((config.sender_name, parseaddr(settings.DEFAULT_FROM_EMAIL)[1])),
        "reply_to": config.reply_to,
        "status": OutgoingEmail.Status.PENDING if enabled else OutgoingEmail.Status.SKIPPED,
    })[0]


def queue_order_placed(order):
    from django.db import transaction
    from .models import Order, OrderEvent
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        event, _ = OrderEvent.objects.get_or_create(order=order, key="placed", defaults={"to_status": order.status})
        queue_email("placed", recipient=order.email, order=order, event=event,
                    idempotency_key=f"order:{order.pk}:placed")
        config = NotificationConfig.get_solo()
        template = get_template("staff_order")
        for recipient in config.order_recipients:
            recipient_key = hashlib.sha256(recipient.lower().encode()).hexdigest()
            queue_email("staff_order", recipient=recipient, order=order, event=event,
                        idempotency_key=f"order:{order.pk}:staff:{recipient_key}",
                        send=config.staff_notifications_enabled and template.enabled)
