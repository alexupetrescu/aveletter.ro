"""Compatibility entry points; delivery is performed by the email worker."""
from .models import Order


def send_order_confirmation_email(order: Order, *, payment_method: str) -> None:
    """Compatibility entry point: persist the order-received notification."""
    from .notifications import queue_order_placed
    queue_order_placed(order)


def send_payment_resume_email(order: Order, *, request=None) -> None:
    from .notifications import queue_email
    queue_email("payment_resume", order=order, recipient=order.email,
                idempotency_key=f"order:{order.pk}:payment_resume")
