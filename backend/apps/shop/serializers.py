from rest_framework import serializers

from .models import (
    Product,
    ProductCategory,
    ProductInputField,
    ProductOption,
    ProductOptionGroup,
    ProductRecommendation,
    ProductVariant,
)
from .recommendations import resolve_recommendations


def asset_data(asset, request=None, alt_override=""):
    if not asset or not asset.file:
        return None
    url = asset.file.url
    return {
        "url": request.build_absolute_uri(url) if request else url,
        "alt_text": alt_override or asset.alt_text,
        "width": asset.width,
        "height": asset.height,
    }


class ProductCategoryBriefSerializer(serializers.ModelSerializer):
    """Nested on products — image omitted; only the categories list endpoint serves it."""

    class Meta:
        model = ProductCategory
        fields = ["name", "slug"]


class ProductCategorySerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = ProductCategory
        fields = ["name", "slug", "description", "image", "sort_order"]

    def get_image(self, obj):
        return asset_data(obj.image, self.context.get("request"))


class ProductVariantSerializer(serializers.ModelSerializer):
    effective_price_amount = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id", "name", "sku", "effective_price_amount",
            "track_stock", "stock_quantity", "sort_order",
        ]


class ProductOptionSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = ProductOption
        fields = [
            "id", "label", "value", "price_delta_amount",
            "color_hex", "image", "extra_production_days", "sort_order",
        ]

    def get_image(self, obj):
        return asset_data(obj.image, self.context.get("request"))


class ProductOptionGroupSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()

    class Meta:
        model = ProductOptionGroup
        fields = [
            "id", "name", "slug", "display_type", "required",
            "min_selections", "max_selections", "sort_order", "options",
        ]

    def get_options(self, obj):
        active = [o for o in obj.options.all() if o.is_active]
        return ProductOptionSerializer(active, many=True, context=self.context).data


class ProductInputFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductInputField
        fields = [
            "key", "label", "field_type", "required", "help_text",
            "placeholder", "min_chars", "max_chars", "min_words", "max_words",
            "sort_order",
        ]


class ProductListSerializer(serializers.ModelSerializer):
    category = ProductCategoryBriefSerializer(read_only=True)
    featured_image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "title", "slug", "product_type", "sku", "category", "short_description",
            "featured_image", "base_price_amount", "currency", "is_featured",
        ]

    def get_featured_image(self, obj):
        return asset_data(obj.featured_image, self.context.get("request"))


class ProductDetailSerializer(ProductListSerializer):
    gallery = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()
    option_groups = ProductOptionGroupSerializer(many=True, read_only=True)
    input_fields = ProductInputFieldSerializer(many=True, read_only=True)
    text_pricing = serializers.SerializerMethodField()
    upsells = serializers.SerializerMethodField()
    cross_sells = serializers.SerializerMethodField()

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + [
            "description", "description_text", "gallery", "variants",
            "option_groups", "input_fields", "text_pricing",
            "upsells", "cross_sells",
            "requires_manual_approval",
            "production_time_min_days", "production_time_max_days",
            "seo_title", "seo_description",
        ]

    def get_gallery(self, obj):
        request = self.context.get("request")
        images = []
        for pi in obj.productimage_set.select_related("asset").all():
            data = asset_data(pi.asset, request, pi.alt_text_override)
            if data:
                images.append(data)
        return images

    def get_variants(self, obj):
        active = [v for v in obj.variants.all() if v.is_active]
        return ProductVariantSerializer(active, many=True).data

    def get_text_pricing(self, obj):
        # Informational only — the client never computes prices from this.
        pricing = getattr(obj, "text_pricing", None)
        if pricing is None:
            return None
        return {"text_field_key": pricing.text_field_key}

    def get_upsells(self, obj):
        products = resolve_recommendations(obj, ProductRecommendation.Kind.UPSELL)
        return ProductListSerializer(products, many=True, context=self.context).data

    def get_cross_sells(self, obj):
        products = resolve_recommendations(obj, ProductRecommendation.Kind.CROSS_SELL)
        return ProductListSerializer(products, many=True, context=self.context).data


class QuoteRequestSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    options = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list,
    )
    inputs = serializers.DictField(required=False, default=dict)
