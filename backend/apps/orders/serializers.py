from rest_framework import serializers

from apps.shop.serializers import asset_data

from .models import Address, Cart, CartItem, CartUpload, Invoice, Order, OrderLine


class CartUploadSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = CartUpload
        fields = ["id", "field_key", "url", "original_filename", "mime_type", "size_bytes"]

    def get_url(self, obj):
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class CartItemSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    product_image = serializers.SerializerMethodField()
    variant_name = serializers.SerializerMethodField()
    selected_option_ids = serializers.SerializerMethodField()
    selected_option_labels = serializers.SerializerMethodField()
    line_total_amount = serializers.SerializerMethodField()
    uploads = CartUploadSerializer(many=True, read_only=True)

    class Meta:
        model = CartItem
        fields = [
            "id", "product_title", "product_slug", "product_image",
            "variant", "variant_name", "selected_option_ids",
            "selected_option_labels", "quantity", "inputs",
            "unit_price_amount", "line_total_amount", "currency",
            "price_breakdown", "uploads",
        ]

    def get_product_image(self, obj):
        return asset_data(obj.product.featured_image, self.context.get("request"))

    def get_variant_name(self, obj):
        return obj.variant.name if obj.variant else None

    def get_selected_option_ids(self, obj):
        return [o.pk for o in obj.selected_options.all()]

    def get_selected_option_labels(self, obj):
        return [
            {"group": o.group.name, "label": o.label}
            for o in obj.selected_options.all()
        ]

    def get_line_total_amount(self, obj):
        return obj.unit_price_amount * obj.quantity


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    subtotal_amount = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ["id", "currency", "items", "subtotal_amount", "updated_at"]

    def get_subtotal_amount(self, obj):
        return sum(i.unit_price_amount * i.quantity for i in obj.items.all())


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "full_name", "phone", "email", "country", "county",
            "city", "postal_code", "line1", "line2",
        ]


class OrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderLine
        fields = [
            "product_title", "product_slug", "variant_name", "sku", "quantity",
            "unit_price_amount", "line_total_amount",
            "line_net_amount", "line_vat_amount",
            "vat_rate_bp", "vat_is_exempt", "vat_legal_mention",
            "currency", "selected_options_snapshot", "inputs_snapshot",
            "price_breakdown",
        ]


class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)
    billing_address = AddressSerializer(read_only=True)
    shipping_address = AddressSerializer(read_only=True)

    class Meta:
        model = Order
        fields = [
            "order_number", "email", "phone", "status",
            "billing_address", "shipping_address", "currency",
            "subtotal_net_amount", "subtotal_amount", "shipping_amount",
            "discount_amount", "vat_amount", "total_amount",
            "vat_enabled_snapshot", "vat_breakdown",
            "customer_notes", "placed_at", "paid_at", "lines",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    number_display = serializers.SerializerMethodField()
    series_code = serializers.CharField(source="series.code", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "number_display", "series_code", "number", "kind", "issued_at",
            "currency", "net_amount", "vat_amount", "gross_amount",
            "snapshot", "efactura_status",
        ]

    def get_number_display(self, obj):
        return str(obj)
