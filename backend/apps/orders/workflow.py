from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import Order, OrderEvent
from .notifications import queue_email


TRANSITIONS = {
    "draft": ["pending_payment", "cancelled"],
    "pending_payment": ["paid", "cancelled"],
    "paid": ["in_production", "cancelled", "refunded"],
    "in_production": ["ready_to_ship", "cancelled"],
    "ready_to_ship": ["shipped"],
    "shipped": ["completed"],
    "completed": ["refunded"],
    "cancelled": ["refunded"],
    "refunded": [],
}


def allowed_transitions(order):
    choices = list(TRANSITIONS.get(order.status, []))
    if order.status == "pending_payment" and order.payments.filter(provider="cash").exists():
        choices.insert(0, "in_production")
    return choices


@transaction.atomic
def update_order(order, *, data, actor=None):
    order = Order.objects.select_for_update().get(pk=order.pk)
    target = data.get("status", order.status)
    changing = target != order.status
    if changing and data.get("expected_status", order.status) != order.status:
        raise ValidationError("Comanda a fost modificată între timp. Reîncarcă pagina.")
    if changing and target not in allowed_transitions(order):
        raise ValidationError("Această schimbare de status nu este permisă.")
    if changing and target == "paid":
        # Manual recording is deliberately separate from changing fulfillment status.
        if not order.payments.filter(status="succeeded").exists():
            raise ValidationError("Înregistrează întâi plata încasată.")
    if changing and target == "refunded" and not order.payments.filter(status="refunded").exists():
        raise ValidationError("Înregistrează mai întâi rambursarea efectuată.")
    old_shipping = {field: getattr(order, field) for field in ("awb", "courier", "tracking_url")}
    for field in ("internal_notes", "awb", "courier", "tracking_url"):
        if field in data:
            setattr(order, field, data[field])
    if target in ("shipped", "completed") and (changing or "awb" in data) and not order.awb.strip():
        raise ValidationError({"awb": "AWB-ul este obligatoriu pentru expediere."})
    if changing:
        previous = order.status
        order.status = target
        if target == "shipped":
            order.shipped_at = timezone.now()
        order.save()
        event = OrderEvent.objects.create(
            order=order, key=target, from_status=previous, to_status=target, actor=actor,
            details={"awb": order.awb, "courier": order.courier, "tracking_url": order.tracking_url},
        )
        if target not in ("draft", "pending_payment"):
            queue_email(target, order=order, recipient=order.email, event=event,
                        idempotency_key=f"event:{event.pk}", send=data.get("send_email"))
    else:
        order.save()
        new_shipping = {field: getattr(order, field) for field in old_shipping}
        if old_shipping != new_shipping:
            OrderEvent.objects.create(order=order, key="shipping_updated", actor=actor,
                                      details={"before": old_shipping, "after": new_shipping})
    return order


@transaction.atomic
def record_payment(order, *, actor=None, send=None, stripe=False):
    from apps.payments.models import Payment
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.paid_at:
        return order
    if order.status in ("cancelled", "refunded", "draft"):
        raise ValidationError("Plata nu poate fi înregistrată în acest status.")
    if not stripe:
        payment = order.payments.filter(provider__in=["cash", "bank_transfer"], status="pending").first()
        if payment is None:
            raise ValidationError("Plățile Stripe sunt confirmate automat de procesator.")
        payment.status = Payment.Status.SUCCEEDED
        payment.save(update_fields=["status", "updated_at"])
    previous = order.status
    order.paid_at = timezone.now()
    if order.status == "pending_payment":
        order.status = "paid"
    order.save(update_fields=["paid_at", "status", "updated_at"])
    event = OrderEvent.objects.create(order=order, key="paid", from_status=previous,
                                      to_status=order.status, actor=actor)
    queue_email("paid", order=order, recipient=order.email, event=event,
                idempotency_key=f"order:{order.pk}:paid", send=send)
    return order


@transaction.atomic
def record_refund(order, *, actor, send=None):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status == "refunded":
        return order
    if "refunded" not in allowed_transitions(order):
        raise ValidationError("Rambursarea nu poate fi înregistrată în acest status.")
    if not order.payments.filter(status="succeeded").exists():
        raise ValidationError("Nu există o plată încasată pentru rambursare.")
    order.payments.filter(status="succeeded").update(status="refunded", updated_at=timezone.now())
    return update_order(order, data={"status": "refunded", "send_email": send}, actor=actor)
