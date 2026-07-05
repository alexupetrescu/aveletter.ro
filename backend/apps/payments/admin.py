from django.contrib import admin

from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["order", "provider", "status", "amount_display", "created_at"]
    list_filter = ["provider", "status"]
    search_fields = [
        "order__order_number",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
    ]
    readonly_fields = [
        "order", "provider", "amount", "currency",
        "stripe_checkout_session_id", "stripe_payment_intent_id",
        "last_event_id", "raw_payload", "created_at", "updated_at",
    ]

    @admin.display(description="Amount")
    def amount_display(self, obj):
        return f"{obj.amount / 100:.2f} {obj.currency}"
