from django.contrib import admin

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
)


@admin.register(VatRate)
class VatRateAdmin(admin.ModelAdmin):
    list_display = ["name", "rate_bp", "is_exempt", "is_active"]


@admin.register(TaxConfig)
class TaxConfigAdmin(admin.ModelAdmin):
    list_display = ["__str__", "vat_enabled", "prices_include_vat", "default_vat_rate"]

    def has_add_permission(self, request):
        return not TaxConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(InvoiceSeries)
class InvoiceSeriesAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "next_number", "is_active"]
    readonly_fields = ["next_number"]


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


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
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
