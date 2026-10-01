import uuid
from functools import wraps

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.invoicing import get_invoice_pdf, issue_invoice, preview_invoice
from apps.orders.models import Address, EmailTemplate, Invoice, NotificationConfig, Order, OrderEvent, OutgoingEmail
from apps.orders.notifications import DEFAULT_TEMPLATES, PLACEHOLDERS, get_template, queue_email, render_template, template_context
from apps.orders.serializers import AddressSerializer
from apps.orders.workflow import record_payment, record_refund, update_order
from .communication_serializers import (
    EmailTemplateSerializer, NotificationConfigSerializer, OrderUpdateSerializer,
    OutgoingEmailSerializer, PaymentRecordSerializer, SendRequestSerializer,
)
from .permissions import CRM_AUTHENTICATION, IsStaff


def validation_errors(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", None) or {"errors": exc.messages})
    return wrapped


def pdf_response(data, filename):
    response = HttpResponse(data, content_type="application/pdf")
    # Numeric IDs/order IDs in filenames only; no user supplied header fragments.
    response["Content-Disposition"] = f'inline; filename="{filename}.pdf"'
    response["Cache-Control"] = "private, no-store"
    return response


class OrderWorkflowActions:
    @validation_errors
    def update(self, request, *args, **kwargs):
        allowed = set(OrderUpdateSerializer().fields)
        if set(request.data) - allowed:
            raise ValidationError({"errors": ["Doar statusul, notele și datele de expediere pot fi modificate aici."]})
        data = OrderUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        order = update_order(self.get_object(), data=data.validated_data, actor=request.user)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["get"], url_path="invoice-preview")
    @validation_errors
    def invoice_preview(self, request, **kwargs):
        return pdf_response(preview_invoice(self.get_object()), "previzualizare-factura")

    @action(detail=True, methods=["post"], url_path="issue-invoice")
    @validation_errors
    def issue(self, request, **kwargs):
        from .serializers import InvoiceCrmSerializer
        invoice = issue_invoice(self.get_object())
        return Response(InvoiceCrmSerializer(invoice).data)

    @action(detail=True, methods=["post"], url_path="record-payment")
    @validation_errors
    def payment(self, request, **kwargs):
        data = PaymentRecordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        order = record_payment(self.get_object(), actor=request.user, send=data.validated_data.get("send_email"))
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"], url_path="record-refund")
    @validation_errors
    def refund(self, request, **kwargs):
        data = PaymentRecordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        order = record_refund(self.get_object(), actor=request.user, send=data.validated_data.get("send_email"))
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["patch"], url_path="billing-address")
    @transaction.atomic
    def billing(self, request, **kwargs):
        order = Order.objects.select_for_update().get(pk=self.get_object().pk)
        if order.invoices.exists():
            raise ValidationError("Datele de facturare nu pot fi schimbate după emiterea facturii.")
        current = AddressSerializer(order.billing_address).data if order.billing_address else {}
        serializer = AddressSerializer(data={**current, **request.data})
        serializer.is_valid(raise_exception=True)
        order.billing_address = Address.objects.create(**serializer.validated_data)
        order.save(update_fields=["billing_address", "updated_at"])
        OrderEvent.objects.create(order=order, key="billing_updated", actor=request.user)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"], url_path="send-shipping-email")
    @validation_errors
    @transaction.atomic
    def shipping_email(self, request, **kwargs):
        data = SendRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        order = Order.objects.select_for_update().get(pk=self.get_object().pk)
        if order.status not in ("shipped", "completed") or not order.awb:
            raise ValidationError("Comanda trebuie expediată și trebuie să aibă AWB.")
        message = queue_email("shipped", order=order, recipient=order.email, send=True,
                              idempotency_key=f"shipping:{order.pk}:{data.validated_data['request_id']}")
        return Response(OutgoingEmailSerializer(message).data)


class InvoiceActions:
    @action(detail=True, methods=["get"])
    @validation_errors
    def pdf(self, request, **kwargs):
        invoice = self.get_object()
        return pdf_response(get_invoice_pdf(invoice), f"factura-{invoice.pk}")

    @action(detail=True, methods=["post"])
    @validation_errors
    @transaction.atomic
    def send(self, request, **kwargs):
        data = SendRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        invoice = Invoice.objects.select_for_update().get(pk=self.get_object().pk)
        request_key = f"invoice:{invoice.pk}:{data.validated_data['request_id']}"
        existing = invoice.emails.filter(idempotency_key=request_key).first()
        if existing:
            return Response(OutgoingEmailSerializer(existing).data)
        pending = invoice.emails.filter(status__in=["pending", "sending"]).first()
        if pending:
            return Response(OutgoingEmailSerializer(pending).data)
        if invoice.emails.exclude(status="skipped").exists() and not data.validated_data["resend"]:
            raise ValidationError("Factura are deja un email în istoric. Folosește Retrimite sau Reîncearcă.")
        get_invoice_pdf(invoice)
        recipient = invoice.snapshot.get("buyer", {}).get("email") or invoice.order.email
        message = queue_email("invoice", order=invoice.order, recipient=recipient, invoice=invoice, send=True,
                              idempotency_key=request_key)
        return Response(OutgoingEmailSerializer(message).data)


class NotificationConfigView(APIView):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]

    def get(self, request):
        return Response(NotificationConfigSerializer(NotificationConfig.get_solo()).data)

    def patch(self, request):
        serializer = NotificationConfigSerializer(NotificationConfig.get_solo(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class EmailTemplateViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]
    queryset = EmailTemplate.objects.order_by("id")
    serializer_class = EmailTemplateSerializer
    pagination_class = None

    def list(self, request, *args, **kwargs):
        for key in DEFAULT_TEMPLATES:
            get_template(key)
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def placeholders(self, request):
        return Response(PLACEHOLDERS)

    @action(detail=True, methods=["post"])
    @validation_errors
    def preview(self, request, **kwargs):
        template = self.get_object()
        serializer = self.get_serializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(template, field, value)
        subject, body, html = render_template(template, template_context())
        return Response({"subject": subject, "body": body, "html": html})

    @action(detail=True, methods=["post"])
    @validation_errors
    def test(self, request, **kwargs):
        recipient = serializers.EmailField().run_validation(request.data.get("recipient"))
        template = self.get_object()
        serializer = self.get_serializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(template, field, value)
        message = queue_email(template.key, recipient=recipient, template=template, send=True,
                              idempotency_key=f"test:{uuid.uuid4()}")
        return Response(OutgoingEmailSerializer(message).data)


class EmailLogViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]
    queryset = OutgoingEmail.objects.all()
    serializer_class = OutgoingEmailSerializer

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def retry(self, request, **kwargs):
        message = OutgoingEmail.objects.select_for_update().get(pk=self.get_object().pk)
        if message.status != "failed":
            raise ValidationError("Doar mesajele eșuate pot fi reîncercate. Pentru un rezultat necunoscut folosește Retrimite.")
        message.status = "pending"
        message.next_attempt_at = timezone.now()
        message.save(update_fields=["status", "next_attempt_at"])
        return Response(self.get_serializer(message).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def resend(self, request, **kwargs):
        data = SendRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        original = OutgoingEmail.objects.select_for_update().get(pk=self.get_object().pk)
        if original.status in ("pending", "sending", "failed"):
            raise ValidationError("Mesajul este în curs sau poate fi reîncercat.")
        fields = ("order_id", "invoice_id", "event_id", "template_key", "recipient", "from_email", "reply_to", "subject", "body", "html_body")
        message, _ = OutgoingEmail.objects.get_or_create(
            idempotency_key=f"resend:{original.pk}:{data.validated_data['request_id']}",
            defaults={field: getattr(original, field) for field in fields},
        )
        return Response(self.get_serializer(message).data)
