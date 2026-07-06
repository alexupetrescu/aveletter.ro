from rest_framework import serializers

from apps.blog.models import AuthorProfile, Category as BlogCategory
from apps.blog.models import Post, PostRevision, SlugRedirect, Tag
from apps.core.richtext import extract_text
from apps.media_library.models import MediaAsset, MediaTag
from apps.orders.models import (
    Address,
    Cart,
    Invoice,
    InvoiceSeries,
    Order,
    OrderLine,
    TaxConfig,
    VatRate,
)
from apps.payments.models import Payment
from apps.shop.sku_utils import normalize_sku, sku_conflict_message
from apps.shop.models import (
    Product,
    ProductCategory,
    ProductCategoryAssignment,
    ProductImage,
    ProductInputField,
    ProductOption,
    ProductOptionGroup,
    ProductRecommendation,
    ProductVariant,
    TextByPagePricing,
)
from apps.site_config.models import HomeHero, HomeInstagram, HomeInstagramImage, SiteConfig


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------

class MediaTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaTag
        fields = ["id", "name", "slug"]


class MediaAssetSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    tags = MediaTagSerializer(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags", queryset=MediaTag.objects.all(),
        many=True, required=False, write_only=True,
    )

    class Meta:
        model = MediaAsset
        fields = [
            "id", "kind", "visibility", "file", "url", "original_filename",
            "mime_type", "size_bytes", "title", "alt_text", "caption",
            "credit", "width", "height", "tags", "tag_ids", "created_at",
        ]
        read_only_fields = [
            "kind", "original_filename", "mime_type", "size_bytes",
            "width", "height", "created_at",
        ]
        extra_kwargs = {"file": {"write_only": True, "required": False}}

    def get_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url

    def create(self, validated_data):
        upload = validated_data.get("file")
        if upload is None:
            raise serializers.ValidationError({"file": "File is required."})
        content_type = getattr(upload, "content_type", "") or ""
        validated_data.setdefault(
            "kind",
            MediaAsset.Kind.IMAGE if content_type.startswith("image/")
            else MediaAsset.Kind.VIDEO if content_type.startswith("video/")
            else MediaAsset.Kind.FILE,
        )
        validated_data["original_filename"] = upload.name
        validated_data["mime_type"] = content_type
        validated_data["size_bytes"] = upload.size
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["uploaded_by"] = request.user
        instance = super().create(validated_data)
        self._fill_dimensions(instance)
        return instance

    @staticmethod
    def _fill_dimensions(instance):
        if instance.kind != MediaAsset.Kind.IMAGE:
            return
        try:
            from PIL import Image

            instance.file.open("rb")
            with Image.open(instance.file) as img:
                instance.width, instance.height = img.size
            instance.save(update_fields=["width", "height"])
        except Exception:  # noqa: BLE001 — dimensions are best-effort
            pass
        finally:
            try:
                instance.file.close()
            except Exception:  # noqa: BLE001
                pass


def asset_summary(asset, request=None):
    if not asset or not asset.file:
        return None
    url = asset.file.url
    return {
        "id": asset.pk,
        "url": request.build_absolute_uri(url) if request else url,
        "alt_text": asset.alt_text,
        "title": asset.title,
    }


# ---------------------------------------------------------------------------
# Shop
# ---------------------------------------------------------------------------

class ProductCategoryCrmSerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)
    image_data = serializers.SerializerMethodField()

    class Meta:
        model = ProductCategory
        fields = [
            "id", "name", "slug", "parent", "description",
            "image", "image_data", "sort_order", "product_count",
        ]

    def get_image_data(self, obj):
        return asset_summary(obj.image, self.context.get("request"))


class ProductCategoryOnProductCrmSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="category.id")
    name = serializers.CharField(source="category.name")
    slug = serializers.CharField(source="category.slug")

    class Meta:
        model = ProductCategoryAssignment
        fields = ["id", "name", "slug", "is_primary", "sort_order"]


class ProductVariantCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductVariant
        fields = [
            "id", "product", "name", "sku", "price_override_amount",
            "is_active", "track_stock", "stock_quantity", "sort_order",
        ]

    def validate_sku(self, value):
        sku = normalize_sku(value)
        exclude_variant = self.instance.pk if self.instance else None
        conflict = sku_conflict_message(
            sku,
            exclude_variant_id=exclude_variant,
        )
        if conflict:
            raise serializers.ValidationError(conflict)
        return sku


class ProductOptionCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductOption
        fields = [
            "id", "group", "label", "value", "price_delta_amount",
            "color_hex", "image", "extra_production_days",
            "is_active", "sort_order",
        ]


class ProductOptionGroupCrmSerializer(serializers.ModelSerializer):
    options = ProductOptionCrmSerializer(many=True, read_only=True)

    class Meta:
        model = ProductOptionGroup
        fields = [
            "id", "product", "name", "slug", "display_type", "required",
            "min_selections", "max_selections", "sort_order", "options",
        ]


class ProductInputFieldCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductInputField
        fields = [
            "id", "product", "key", "label", "field_type", "required",
            "help_text", "placeholder", "min_chars", "max_chars",
            "min_words", "max_words", "validation_regex", "sort_order",
        ]


class ProductImageCrmSerializer(serializers.ModelSerializer):
    asset_data = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = ["id", "product", "asset", "asset_data", "alt_text_override", "sort_order"]

    def get_asset_data(self, obj):
        return asset_summary(obj.asset, self.context.get("request"))


class HomeInstagramImageCrmSerializer(serializers.ModelSerializer):
    asset_data = serializers.SerializerMethodField()

    class Meta:
        model = HomeInstagramImage
        fields = ["id", "asset", "asset_data", "sort_order"]

    def get_asset_data(self, obj):
        return asset_summary(obj.asset, self.context.get("request"))

    def validate_asset(self, value):
        strip = HomeInstagram.get_solo()
        qs = HomeInstagramImage.objects.filter(strip=strip, asset=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Imaginea este deja în banda Instagram.")
        return value


class TextByPagePricingCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = TextByPagePricing
        fields = [
            "id", "product", "text_field_key", "pricing_mode", "words_per_page",
            "average_words_per_page", "price_per_unit_amount", "minimum_pages",
            "maximum_pages", "setup_fee_amount", "round_up",
        ]

    def validate(self, attrs):
        product = attrs.get("product") or (self.instance and self.instance.product)
        key = attrs.get("text_field_key") or (
            self.instance and self.instance.text_field_key
        )
        if product and key:
            if not product.input_fields.filter(key=key).exists():
                raise serializers.ValidationError({
                    "text_field_key": (
                        f"No input field with key '{key}' on this product. "
                        "Create the input field first."
                    ),
                })
        return attrs

    def save(self, **kwargs):
        instance = super().save(**kwargs)
        instance.product.input_fields.filter(key=instance.text_field_key).update(
            required=True,
        )
        return instance


class ProductRecommendationCrmSerializer(serializers.ModelSerializer):
    target_data = serializers.SerializerMethodField()

    class Meta:
        model = ProductRecommendation
        fields = [
            "id", "source", "target", "target_data", "kind", "sort_order",
        ]

    def get_target_data(self, obj):
        target = obj.target
        return {
            "id": target.pk,
            "title": target.title,
            "slug": target.slug,
            "status": target.status,
            "base_price_amount": target.base_price_amount,
            "currency": target.currency,
            "featured_image_data": asset_summary(
                target.featured_image, self.context.get("request"),
            ),
        }

    def validate(self, attrs):
        source = attrs.get("source") or (self.instance and self.instance.source)
        target = attrs.get("target") or (self.instance and self.instance.target)
        if source and target and source.pk == target.pk:
            raise serializers.ValidationError({
                "target": "Un produs nu poate fi recomandat către el însuși.",
            })
        return attrs


class ProductCrmListSerializer(serializers.ModelSerializer):
    category = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()
    categories = ProductCategoryOnProductCrmSerializer(
        source="category_assignments", many=True, read_only=True,
    )
    featured_image_data = serializers.SerializerMethodField()
    publish_state = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "title", "slug", "product_type", "status", "publish_state",
            "category", "category_name", "categories", "sku", "base_price_amount",
            "currency",
            "is_featured", "featured_image_data", "published_at", "updated_at",
            "stock_quantity", "stock_status",
        ]

    def get_category(self, obj):
        primary = obj.primary_category
        return primary.pk if primary else None

    def get_category_name(self, obj):
        names = [a.category.name for a in obj.category_assignments.all()]
        return ", ".join(names) if names else None

    def get_featured_image_data(self, obj):
        return asset_summary(obj.featured_image, self.context.get("request"))

    def get_publish_state(self, obj):
        if obj.status != obj.Status.PUBLISHED:
            return obj.get_status_display()
        return "Live" if obj.is_live else "Programat"


class ProductCrmDetailSerializer(ProductCrmListSerializer):
    category_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True,
    )
    primary_category_id = serializers.IntegerField(
        required=False, allow_null=True, write_only=True,
    )
    variants = ProductVariantCrmSerializer(many=True, read_only=True)
    option_groups = ProductOptionGroupCrmSerializer(many=True, read_only=True)
    input_fields = ProductInputFieldCrmSerializer(many=True, read_only=True)
    images = ProductImageCrmSerializer(
        source="productimage_set", many=True, read_only=True,
    )
    text_pricing = TextByPagePricingCrmSerializer(read_only=True)

    class Meta(ProductCrmListSerializer.Meta):
        fields = ProductCrmListSerializer.Meta.fields + [
            "category_ids", "primary_category_id",
            "short_description", "description", "description_text",
            "featured_image", "vat_rate", "requires_manual_approval",
            "production_time_min_days", "production_time_max_days",
            "seo_title", "seo_description",
            "variants", "option_groups", "input_fields", "images",
            "text_pricing",
        ]
        read_only_fields = ["description_text", "updated_at"]

    def validate_sku(self, value):
        sku = normalize_sku(value)
        exclude_product = self.instance.pk if self.instance else None
        conflict = sku_conflict_message(
            sku,
            exclude_product_id=exclude_product,
        )
        if conflict:
            raise serializers.ValidationError(conflict)
        return sku

    def create(self, validated_data):
        category_ids = validated_data.pop("category_ids", None)
        primary_category_id = validated_data.pop("primary_category_id", None)
        product = super().create(validated_data)
        if category_ids is not None:
            product.set_categories(category_ids, primary_category_id)
        return product

    def update(self, instance, validated_data):
        category_ids = validated_data.pop("category_ids", None)
        primary_category_id = validated_data.pop("primary_category_id", None)
        product = super().update(instance, validated_data)
        if category_ids is not None:
            product.set_categories(category_ids, primary_category_id)
        return product

    def save(self, **kwargs):
        # description is a Tiptap JSON doc; keep the plain-text mirror in sync.
        if "description" in self.validated_data:
            kwargs["description_text"] = extract_text(
                self.validated_data["description"],
            )
        return super().save(**kwargs)


# ---------------------------------------------------------------------------
# Blog
# ---------------------------------------------------------------------------

class BlogCategoryCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogCategory
        fields = ["id", "name", "slug", "description", "sort_order"]


class TagCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "slug"]


class SlugRedirectCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = SlugRedirect
        fields = ["id", "old_path", "new_path", "created_at"]


class PostRevisionCrmSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PostRevision
        fields = ["id", "body", "body_text", "created_by_name", "created_at"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_username() if obj.created_by else None


class PostCrmListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    author_name = serializers.SerializerMethodField()
    publish_state = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            "id", "title", "slug", "status", "publish_state", "category",
            "category_name", "author_name", "published_at", "updated_at",
        ]

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.get_username()

    def get_publish_state(self, obj):
        if obj.status != obj.Status.PUBLISHED:
            return obj.get_status_display()
        return "Live" if obj.is_live else "Programat"


class PostCrmDetailSerializer(PostCrmListSerializer):
    featured_image_data = serializers.SerializerMethodField()
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags", queryset=Tag.objects.all(), many=True, required=False,
    )

    class Meta(PostCrmListSerializer.Meta):
        fields = PostCrmListSerializer.Meta.fields + [
            "body", "body_text", "excerpt", "reading_time",
            "featured_image", "featured_image_data", "og_image",
            "tag_ids", "seo_title", "seo_description",
            "canonical_url", "noindex",
        ]
        read_only_fields = ["body_text", "updated_at"]

    def get_featured_image_data(self, obj):
        return asset_summary(obj.featured_image, self.context.get("request"))

    def save(self, **kwargs):
        if "body" in self.validated_data:
            body_text = extract_text(self.validated_data["body"])
            kwargs["body_text"] = body_text
            # Rough reading time: 200 words/minute, minimum 1.
            words = len(body_text.split())
            kwargs["reading_time"] = max(1, round(words / 200)) if words else 0
        request = self.context.get("request")
        if self.instance is None and request:
            kwargs["author"] = request.user
        instance = super().save(**kwargs)
        if request:
            PostRevision.objects.create(
                post=instance,
                body=instance.body,
                body_text=instance.body_text,
                schema_version=instance.schema_version,
                created_by=request.user,
            )
        return instance


class AuthorProfileCrmSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_name = serializers.SerializerMethodField()
    photo_data = serializers.SerializerMethodField()

    class Meta:
        model = AuthorProfile
        fields = [
            "id", "user_id", "user_name", "photo", "photo_data",
            "bio", "instagram_url", "facebook_url",
        ]

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.get_username()

    def get_photo_data(self, obj):
        return asset_summary(obj.photo, self.context.get("request"))


# ---------------------------------------------------------------------------
# Orders / fiscal
# ---------------------------------------------------------------------------

class AddressCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "id", "full_name", "phone", "email", "country", "county",
            "city", "postal_code", "line1", "line2",
        ]


class OrderLineCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderLine
        fields = [
            "id", "product", "product_title", "product_slug", "variant_name",
            "sku", "quantity", "unit_price_amount", "line_total_amount",
            "line_net_amount", "line_vat_amount", "vat_rate_bp",
            "vat_is_exempt", "vat_legal_mention", "currency",
            "selected_options_snapshot", "inputs_snapshot",
            "price_breakdown", "production_notes",
        ]


class PaymentCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            "id", "order", "provider", "status", "amount", "currency",
            "stripe_checkout_session_id", "stripe_payment_intent_id",
            "created_at", "updated_at",
        ]


class InvoiceCrmSerializer(serializers.ModelSerializer):
    number_display = serializers.SerializerMethodField()
    series_code = serializers.CharField(source="series.code", read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "number_display", "series_code", "number", "kind",
            "order", "order_number", "issued_at", "currency",
            "net_amount", "vat_amount", "gross_amount", "snapshot",
            "efactura_status", "efactura_message", "created_at",
        ]

    def get_number_display(self, obj):
        return str(obj)


class OrderCrmListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = [
            "id", "order_number", "email", "phone", "status", "currency",
            "total_amount", "placed_at", "paid_at", "created_at",
        ]


class OrderCrmDetailSerializer(OrderCrmListSerializer):
    lines = OrderLineCrmSerializer(many=True, read_only=True)
    payments = PaymentCrmSerializer(many=True, read_only=True)
    invoices = InvoiceCrmSerializer(many=True, read_only=True)
    billing_address = AddressCrmSerializer(read_only=True)
    shipping_address = AddressCrmSerializer(read_only=True)

    class Meta(OrderCrmListSerializer.Meta):
        fields = OrderCrmListSerializer.Meta.fields + [
            "subtotal_net_amount", "subtotal_amount", "shipping_amount",
            "discount_amount", "vat_amount", "vat_enabled_snapshot",
            "vat_breakdown", "customer_notes", "internal_notes",
            "billing_address", "shipping_address",
            "lines", "payments", "invoices",
        ]


class CartCrmSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    subtotal_amount = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = [
            "id", "session_key", "user", "currency",
            "item_count", "subtotal_amount", "created_at", "updated_at",
        ]

    def get_item_count(self, obj):
        return sum(i.quantity for i in obj.items.all())

    def get_subtotal_amount(self, obj):
        return sum(i.unit_price_amount * i.quantity for i in obj.items.all())


class VatRateCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = VatRate
        fields = ["id", "name", "rate_bp", "is_exempt", "legal_mention", "is_active"]


class TaxConfigCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxConfig
        fields = [
            "id", "vat_enabled", "prices_include_vat", "default_vat_rate",
            "legal_name", "cui", "reg_com", "fiscal_address", "updated_at",
        ]


class InvoiceSeriesCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceSeries
        fields = ["id", "code", "name", "next_number", "is_active"]
        read_only_fields = ["next_number"]


class SiteConfigCrmSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteConfig
        fields = [
            "id", "site_name", "domain", "contact_email", "contact_phone",
            "instagram_url", "facebook_url", "default_seo_title",
            "default_seo_description", "default_og_image",
            "announcement_enabled", "announcement_text",
            "delivery_fee_amount", "free_shipping_threshold_amount",
            "maintenance_mode", "updated_at",
        ]


class HomeHeroCrmSerializer(serializers.ModelSerializer):
    background_image_data = serializers.SerializerMethodField()

    class Meta:
        model = HomeHero
        fields = [
            "id", "background_image", "background_image_data", "tagline", "title", "copy",
            "primary_button_label", "primary_button_url",
            "secondary_button_label", "secondary_button_url", "updated_at",
        ]
        read_only_fields = ["background_image_data", "updated_at"]

    def get_background_image_data(self, obj):
        return asset_summary(obj.background_image, self.context.get("request"))
