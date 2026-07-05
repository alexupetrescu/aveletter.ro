from django.db import models


class Payment(models.Model):
    class Provider(models.TextChoices):
        STRIPE = "stripe", "Stripe"
        BANK_TRANSFER = "bank_transfer", "Bank transfer"
        CASH = "cash", "Cash"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    order = models.ForeignKey(
        "orders.Order", on_delete=models.CASCADE, related_name="payments",
    )
    provider = models.CharField(
        max_length=30, choices=Provider.choices, default=Provider.STRIPE,
    )
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.PENDING,
    )
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="RON")
    # Stripe identifiers
    stripe_checkout_session_id = models.CharField(max_length=255, blank=True, db_index=True)
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True, db_index=True)
    # Idempotency: Stripe event id, so the same webhook can't be applied twice.
    last_event_id = models.CharField(max_length=255, blank=True, db_index=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_provider_display()} {self.amount / 100:.2f} {self.currency} ({self.status})"
