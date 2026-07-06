from django.core.management.base import BaseCommand, CommandError

from apps.orders.emails import send_order_confirmation_email
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
        payment_method = options["payment_method"]

        order = Order.objects.filter(order_number=order_number).first()
        if order is None:
            raise CommandError(f"Order not found: {order_number}")

        send_order_confirmation_email(order, payment_method=payment_method)
        self.stdout.write(
            self.style.SUCCESS(
                f"Sent confirmation email for {order_number} to {order.email}",
            ),
        )
