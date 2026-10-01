from django.contrib import admin
from django import forms
from django.core.exceptions import ValidationError
from django.db import transaction

from apps.payments.models import Payment

from .models import (
    Address,
    Cart,
    CartItem,
    CustomerProfile,
    Invoice,
    InvoiceSeries,
    Order,
    OrderLine,
    TaxConfig,
    VatRate,
    NotificationConfig,
    EmailTemplate,
    OrderEvent,
    OutgoingEmail,
)


class TaxConfigForm(forms.ModelForm):
    class Meta:
        model = TaxConfig
        fields = "__all__"

    def clean(self):
        data = super().clean()
        from apps.crm.serializers import TaxConfigCrmSerializer
        validator = TaxConfigCrmSerializer()
        for field in ("invoice_logo", "payment_term_days", "default_invoice_series"):
            if field in data:
                try:
                    getattr(validator, f"validate_{field}")(data[field])
                except Exception as exc:
                    self.add_error(field, str(exc))
        return data


@admin.register(VatRate)
class VatRateAdmin(admin.ModelAdmin):
    list_display = ["name", "rate_bp", "is_exempt", "is_active"]


@admin.register(TaxConfig)
class TaxConfigAdmin(admin.ModelAdmin):
    form = TaxConfigForm
    list_display = ["__str__", "vat_enabled", "prices_include_vat", "default_vat_rate"]

    def has_add_permission(self, request):
        return not TaxConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(InvoiceSeries)
class InvoiceSeriesAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "next_number", "is_active"]
    def get_readonly_fields(self, request, obj=None):
        return ["code", "next_number"] if obj and obj.invoice_set.exists() else []

    @transaction.atomic
    def save_model(self, request, obj, form, change):
        if change:
            old = InvoiceSeries.objects.select_for_update().get(pk=obj.pk)
            if old.invoice_set.exists():
                obj.code, obj.next_number = old.code, old.next_number
        super().save_model(request, obj, form, change)


class OrderLineInline(admin.StackedInline):
    model = OrderLine
    extra = 0
    can_delete = False
    readonly_fields = [f.name for f in OrderLine._meta.fields if f.name != "id"]

    def has_add_permission(self, request, obj=None):
        return False


class InvoiceInline(admin.TabularInline):
    model = Invoice
    extra = 0
    can_delete = False
    show_change_link = True
    readonly_fields = [
        "kind", "series", "number", "issued_at",
        "net_amount", "vat_amount", "gross_amount", "efactura_status",
    ]
    fields = readonly_fields

    def has_add_permission(self, request, obj=None):
        return False


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    can_delete = False
    readonly_fields = [
        "provider", "status", "amount", "currency",
        "stripe_checkout_session_id", "stripe_payment_intent_id", "created_at",
    ]
    fields = readonly_fields

    def has_add_permission(self, request, obj=None):
        return False


class OrderForm(forms.ModelForm):
    send_email = forms.BooleanField(label="Trimite email clientului", required=False, initial=True)

    class Meta:
        model = Order
        fields = "__all__"

    def clean(self):
        data = super().clean()
        if not self.instance.pk:
            return data
        from .workflow import allowed_transitions
        old = Order.objects.get(pk=self.instance.pk)
        target = data.get("status", old.status)
        if target != old.status:
            if target not in allowed_transitions(old):
                raise ValidationError("Schimbare de status nepermisă.")
            if target in ("paid", "refunded"):
                payment_status = "succeeded" if target == "paid" else "refunded"
                if not old.payments.filter(status=payment_status).exists():
                    raise ValidationError("Înregistrează operațiunea financiară din CRM înainte de schimbarea statusului.")
        if target in ("shipped", "completed") and not data.get("awb", old.awb):
            self.add_error("awb", "AWB-ul este obligatoriu.")
        return data


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    form = OrderForm

    def has_add_permission(self, request):
        return False

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in Order._meta.fields
                if field.name not in ("status", "internal_notes", "awb", "courier", "tracking_url")]

    def save_model(self, request, obj, form, change):
        from .workflow import update_order
        from .notifications import DEFAULT_TEMPLATES, get_template
        target = form.cleaned_data["status"]
        send = form.cleaned_data.get("send_email", True)
        if target in DEFAULT_TEMPLATES:
            send = send and get_template(target).enabled
        saved = update_order(obj, actor=request.user, data={
            **{field: form.cleaned_data[field] for field in ("status", "internal_notes", "awb", "courier", "tracking_url")},
            "send_email": send,
        })
        obj.__dict__.update(saved.__dict__)
    list_display = [
        "order_number", "email", "status", "total_display",
        "placed_at", "paid_at",
    ]
    list_filter = ["status"]
    search_fields = ["order_number", "email", "phone"]
    readonly_fields = [
        "order_number", "subtotal_net_amount", "subtotal_amount",
        "vat_amount", "total_amount", "vat_breakdown",
        "vat_enabled_snapshot", "placed_at", "paid_at",
        "created_at", "updated_at",
    ]
    inlines = [OrderLineInline, InvoiceInline, PaymentInline]
    date_hierarchy = "created_at"

    @admin.display(description="Total")
    def total_display(self, obj):
        return f"{obj.total_amount / 100:.2f} {obj.currency}"


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in Invoice._meta.fields if field.name != "pdf_data"]

    exclude = ["pdf_data"]
    list_display = [
        "__str__", "kind", "order", "gross_display",
        "issued_at", "efactura_status",
    ]
    list_filter = ["kind", "efactura_status"]
    search_fields = ["order__order_number"]
    readonly_fields = [
        "order", "kind", "series", "number", "issued_at", "currency",
        "net_amount", "vat_amount", "gross_amount", "snapshot",
        "reverses", "created_at",
    ]

    @admin.display(description="Gross")
    def gross_display(self, obj):
        return f"{obj.gross_amount / 100:.2f} {obj.currency}"

    def has_delete_permission(self, request, obj=None):
        # Issued invoices are immutable; corrections are storno documents.
        return False


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    readonly_fields = ["product", "variant", "quantity", "unit_price_amount", "inputs"]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ["id", "session_key", "user", "updated_at"]
    inlines = [CartItemInline]


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ["full_name", "city", "county", "phone"]
    search_fields = ["full_name", "city", "phone", "email"]


@admin.register(CustomerProfile)
class CustomerProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "phone", "accepts_marketing"]


class NotificationConfigForm(forms.ModelForm):
    class Meta:
        model = NotificationConfig
        fields = "__all__"

    def clean(self):
        data = super().clean()
        from apps.crm.communication_serializers import NotificationConfigSerializer
        serializer = NotificationConfigSerializer(data={
            field: data.get(field) for field in NotificationConfigSerializer.Meta.fields
        })
        if not serializer.is_valid():
            raise ValidationError(str(serializer.errors))
        data.update(serializer.validated_data)
        return data


@admin.register(NotificationConfig)
class NotificationConfigAdmin(admin.ModelAdmin):
    form = NotificationConfigForm

    def has_add_permission(self, request):
        return not NotificationConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        obj.pk = 1
        super().save_model(request, obj, form, change)


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "enabled", "updated_at"]
    readonly_fields = ["key", "name", "updated_at"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(OutgoingEmail)
class OutgoingEmailAdmin(admin.ModelAdmin):
    list_display = ["recipient", "template_key", "status", "attempts", "sent_at"]
    list_filter = ["status", "template_key"]
    search_fields = ["recipient", "subject"]
    readonly_fields = [field.name for field in OutgoingEmail._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(OrderEvent)
class OrderEventAdmin(admin.ModelAdmin):
    list_display = ["order", "key", "actor", "created_at"]
    readonly_fields = [field.name for field in OrderEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
