from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.orders.models import EmailTemplate, NotificationConfig, Order, OrderEvent, OutgoingEmail
from apps.orders.notifications import validate_template


class NotificationConfigSerializer(serializers.ModelSerializer):
    order_recipients = serializers.ListField(child=serializers.EmailField(), max_length=20, allow_empty=True)

    class Meta:
        model = NotificationConfig
        fields = ["staff_notifications_enabled", "order_recipients", "sender_name", "reply_to"]

    def validate_order_recipients(self, value):
        return list(dict.fromkeys(address.strip().lower() for address in value))

    def validate_sender_name(self, value):
        if "\n" in value or "\r" in value:
            raise serializers.ValidationError("Numele trebuie să fie pe un singur rând.")
        return value


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = ["id", "key", "name", "enabled", "subject", "body", "updated_at"]
        read_only_fields = ["key", "name", "updated_at"]

    def validate(self, attrs):
        try:
            validate_template(attrs.get("subject", self.instance.subject if self.instance else ""),
                              attrs.get("body", self.instance.body if self.instance else ""))
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return attrs


class OutgoingEmailSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutgoingEmail
        fields = ["id", "template_key", "recipient", "subject", "body", "status", "attempts",
                  "last_error", "sent_at", "created_at", "next_attempt_at", "invoice", "event"]
        read_only_fields = fields


class OrderEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.username", default="Sistem", read_only=True)

    class Meta:
        model = OrderEvent
        fields = ["id", "key", "from_status", "to_status", "actor_name", "details", "created_at"]
        read_only_fields = fields


class OrderUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices, required=False)
    expected_status = serializers.ChoiceField(choices=Order.Status.choices, required=False)
    send_email = serializers.BooleanField(required=False)
    internal_notes = serializers.CharField(required=False, allow_blank=True)
    awb = serializers.CharField(required=False, allow_blank=True, max_length=100)
    courier = serializers.CharField(required=False, allow_blank=True, max_length=100)
    tracking_url = serializers.URLField(required=False, allow_blank=True, max_length=200)


class SendRequestSerializer(serializers.Serializer):
    request_id = serializers.UUIDField()
    resend = serializers.BooleanField(default=False)


class PaymentRecordSerializer(serializers.Serializer):
    confirmed = serializers.BooleanField()
    send_email = serializers.BooleanField(required=False)

    def validate_confirmed(self, value):
        if not value:
            raise serializers.ValidationError("Confirmă că operațiunea financiară a fost efectuată.")
        return value
