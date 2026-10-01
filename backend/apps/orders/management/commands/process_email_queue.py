import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from apps.orders.mail_worker import deliver_next


class Command(BaseCommand):
    help = "Send queued order and invoice emails. Use --watch for a supervised worker."

    def add_arguments(self, parser):
        parser.add_argument("--watch", action="store_true")
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        while True:
            close_old_connections()
            count = 0
            while count < options["limit"] and deliver_next():
                count += 1
            if not options["watch"]:
                self.stdout.write(f"Processed {count} message(s).")
                return
            if count == 0:
                time.sleep(2)
