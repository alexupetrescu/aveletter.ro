import logging
import smtplib
from datetime import timedelta

from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import OutgoingEmail

logger = logging.getLogger(__name__)


def deliver_next():
    """Claim one message, commit the claim, then do network I/O outside the lock."""
    now = timezone.now()
    # A crashed sender may already have delivered its message. Never silently resend it.
    OutgoingEmail.objects.filter(status="sending", claimed_at__lt=now - timedelta(minutes=10)).update(
        status="uncertain", last_error="Procesul de trimitere s-a oprit. Verifică înainte de retrimitere.",
    )
    with transaction.atomic():
        message = (OutgoingEmail.objects.select_for_update(skip_locked=True)
                   .filter(Q(status="pending") | Q(status="failed", attempts__lt=5))
                   .filter(next_attempt_at__lte=now).order_by("created_at", "pk").first())
        if message is None:
            return False
        message.status = "sending"
        message.claimed_at = now
        message.attempts += 1
        message.save(update_fields=["status", "claimed_at", "attempts"])
    try:
        mail = EmailMultiAlternatives(
            subject=message.subject, body=message.body, from_email=message.from_email,
            to=[message.recipient], reply_to=[message.reply_to] if message.reply_to else [],
            headers={"Message-ID": f"<aveletter-{message.pk}@{message.from_email.split('@')[-1].rstrip('>')}>"},
        )
        mail.attach_alternative(message.html_body, "text/html")
        if message.invoice_id:
            from .invoicing import get_invoice_pdf
            mail.attach(f"Factura-{message.invoice}.pdf", get_invoice_pdf(message.invoice), "application/pdf")
        if mail.send() != 1:
            raise RuntimeError("Serverul de email nu a acceptat mesajul.")
    except (TimeoutError, smtplib.SMTPServerDisconnected) as exc:
        OutgoingEmail.objects.filter(pk=message.pk).update(status="uncertain", last_error=str(exc)[:2000])
    except Exception as exc:
        logger.exception("Email %s failed", message.pk)
        OutgoingEmail.objects.filter(pk=message.pk).update(
            status="failed", last_error=str(exc)[:2000],
            next_attempt_at=now + timedelta(seconds=min(3600, 30 * 2 ** message.attempts)),
        )
    else:
        OutgoingEmail.objects.filter(pk=message.pk).update(status="sent", sent_at=timezone.now(), last_error="")
        if message.template_key == "payment_resume" and message.order_id:
            from .models import Order
            Order.objects.filter(pk=message.order_id).update(payment_resume_email_sent_at=timezone.now())
    return True
