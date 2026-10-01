import uuid

from django.core.management.base import BaseCommand, CommandError

from apps.orders.notifications import queue_email
from apps.orders.models import Order


class Command(BaseCommand):
    help = "Send a test order confirmation email for an existing order."

    def add_arguments(self, parser):
        parser.add_argument("order_number", help="Order number, e.g. AVE-20260706-A1B2")
        parser.add_argument(
            "--payment-method",
            choices=["ramburs", "stripe"],
            default="stripe",
            help="Payment method label shown in the email (default: stripe)",
        )

    def handle(self, *args, **options):
        order_number = options["order_number"]

        order = Order.objects.filter(order_number=order_number).first()
        if order is None:
            raise CommandError(f"Order not found: {order_number}")

        queue_email("placed", order=order, recipient=order.email, send=True,
                    idempotency_key=f"test-order:{uuid.uuid4()}")
        self.stdout.write(
            self.style.SUCCESS(
                f"Queued confirmation email for {order_number} to {order.email}; run process_email_queue to deliver it.",
            ),
        )
