from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import Publishable, PublishedQuerySet


class ProductCategory(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True,
        on_delete=models.CASCADE, related_name="children",
    )
    description = models.TextField(blank=True)
    image = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name_plural = "product categories"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class ProductCategoryAssignment(models.Model):
    product = models.ForeignKey(
        "Product", on_delete=models.CASCADE, related_name="category_assignments",
    )
    category = models.ForeignKey(
        ProductCategory, on_delete=models.CASCADE, related_name="product_assignments",
    )
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-is_primary", "sort_order"]
        unique_together = [("product", "category")]

    def __str__(self):
        flag = " (primary)" if self.is_primary else ""
        return f"{self.product.title} → {self.category.name}{flag}"


class Product(Publishable):
    class ProductType(models.TextChoices):
        STANDARD = "standard", "Standard product"
        TEXT_BY_PAGE = "text_by_page", "Text priced by page"
        ORNAMENT = "ornament", "Short text ornament"
        CUSTOM_QUOTE = "custom_quote", "Custom quote"
        PREMADE = "premade", "Premade product (with stock)"

    product_type = models.CharField(
        max_length=30, choices=ProductType.choices, default=ProductType.STANDARD,
    )
    categories = models.ManyToManyField(
        ProductCategory,
        through="ProductCategoryAssignment",
        blank=True,
        related_name="products",
    )
    short_description = models.TextField(blank=True)
    description = models.JSONField(default=dict, blank=True)
    description_text = models.TextField(blank=True)
    featured_image = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    gallery = models.ManyToManyField(
        "media_library.MediaAsset", through="ProductImage",
        blank=True, related_name="products",
    )
    base_price_amount = models.PositiveIntegerField(
        default=0, help_text="Base price in bani. Example: 5000 = 50 RON.",
    )
    # Blank strings collide on unique in Postgres ('' is a real value).
    # NULL means "no SKU yet"; NULLs are exempt from the unique constraint.
    sku = models.CharField(
        max_length=100, unique=True, null=True, blank=True, default=None,
    )
    currency = models.CharField(max_length=3, default="RON")
    # Product can override the site default VAT rate. If empty, the active
    # TaxConfig default applies.
    vat_rate = models.ForeignKey(
        "orders.VatRate", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="products",
        help_text="If empty, the active site default VAT rate applies.",
    )
    is_featured = models.BooleanField(default=False)
    requires_manual_approval = models.BooleanField(
        default=False, help_text="Useful for complex custom work.",
    )
    production_time_min_days = models.PositiveIntegerField(default=3)
    production_time_max_days = models.PositiveIntegerField(default=10)

    class StockStatus(models.TextChoices):
        IN_STOCK = "in_stock", "În stoc"
        LIMITED = "limited", "Stoc limitat"
        ON_ORDER = "on_order", "La comandă"

    stock_quantity = models.PositiveIntegerField(
        default=0,
        help_text="For premade products: units available in atelier.",
    )
    stock_status = models.CharField(
        max_length=20,
        choices=StockStatus.choices,
        default=StockStatus.ON_ORDER,
        help_text="How availability is shown to clients (premade products).",
    )

    objects = PublishedQuerySet.as_manager()

    class Meta:
        ordering = ["title"]
        indexes = [
            models.Index(fields=["status", "product_type"]),
            models.Index(fields=["is_featured", "status"]),
        ]

    def __str__(self):
        return self.title

    @property
    def primary_category(self):
        assignments = list(self.category_assignments.all())
        if not assignments:
            return None
        primary = next((a for a in assignments if a.is_primary), None)
        return (primary or assignments[0]).category

    def set_categories(self, category_ids, primary_category_id=None):
        """Replace category assignments; first id is primary when omitted."""
        category_ids = list(dict.fromkeys(category_ids))
        if not category_ids:
            self.category_assignments.all().delete()
            return

        if primary_category_id is None or primary_category_id not in category_ids:
            primary_category_id = category_ids[0]

        existing = {
            a.category_id: a
            for a in self.category_assignments.all()
        }
        keep_ids = set(category_ids)
        self.category_assignments.exclude(category_id__in=keep_ids).delete()

        for order, cat_id in enumerate(category_ids):
            is_primary = cat_id == primary_category_id
            assignment = existing.get(cat_id)
            if assignment:
                changed = (
                    assignment.is_primary != is_primary
                    or assignment.sort_order != order
                )
                if changed:
                    assignment.is_primary = is_primary
                    assignment.sort_order = order
                    assignment.save(update_fields=["is_primary", "sort_order"])
            else:
                ProductCategoryAssignment.objects.create(
                    product=self,
                    category_id=cat_id,
                    is_primary=is_primary,
                    sort_order=order,
                )

    def save(self, *args, **kwargs):
        if self.sku == "":
            self.sku = None
        super().save(*args, **kwargs)

    @property
    def public_availability(self):
        """Client-facing stock label for premade products."""
        if self.product_type != self.ProductType.PREMADE:
            return None
        if self.stock_quantity == 0:
            return {
                "status": self.StockStatus.ON_ORDER,
                "label": "La comandă",
                "show_quantity": False,
                "quantity": 0,
            }
        if self.stock_status == self.StockStatus.IN_STOCK:
            return {
                "status": self.StockStatus.IN_STOCK,
                "label": "În stoc",
                "show_quantity": False,
                "quantity": self.stock_quantity,
            }
        if self.stock_status == self.StockStatus.LIMITED:
            return {
                "status": self.StockStatus.LIMITED,
                "label": "Stoc limitat",
                "show_quantity": True,
                "quantity": self.stock_quantity,
            }
        return {
            "status": self.StockStatus.ON_ORDER,
            "label": "La comandă",
            "show_quantity": False,
            "quantity": self.stock_quantity,
        }


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    asset = models.ForeignKey("media_library.MediaAsset", on_delete=models.CASCADE)
    alt_text_override = models.CharField(max_length=500, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order"]
        unique_together = [("product", "asset")]

    def __str__(self):
        return f"{self.product.title} image #{self.sort_order}"


class ProductVariant(models.Model):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="variants",
    )
    name = models.CharField(max_length=100)
    # Blank strings collide on unique in Postgres ('' is a real value).
    # NULL means "no SKU yet"; NULLs are exempt from the unique constraint.
    sku = models.CharField(
        max_length=100, unique=True, null=True, blank=True, default=None,
    )
    price_override_amount = models.PositiveIntegerField(
        null=True, blank=True, help_text="If empty, product base price is used.",
    )
    is_active = models.BooleanField(default=True)
    track_stock = models.BooleanField(default=False)
    stock_quantity = models.PositiveIntegerField(default=0)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return f"{self.product.title} — {self.name}"

    def save(self, *args, **kwargs):
        if self.sku == "":
            self.sku = None
        super().save(*args, **kwargs)

    @property
    def effective_price_amount(self):
        return (
            self.price_override_amount
            if self.price_override_amount is not None
            else self.product.base_price_amount
        )


class ProductOptionGroup(models.Model):
    class DisplayType(models.TextChoices):
        SELECT = "select", "Select"
        RADIO = "radio", "Radio"
        COLOR = "color", "Color swatches"
        CHECKBOX = "checkbox", "Checkboxes"

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="option_groups",
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField()
    display_type = models.CharField(
        max_length=20, choices=DisplayType.choices, default=DisplayType.SELECT,
    )
    required = models.BooleanField(default=False)
    min_selections = models.PositiveIntegerField(default=0)
    max_selections = models.PositiveIntegerField(default=1)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        unique_together = [("product", "slug")]

    def __str__(self):
        return f"{self.product.title} — {self.name}"


class ProductOption(models.Model):
    group = models.ForeignKey(
        ProductOptionGroup, on_delete=models.CASCADE, related_name="options",
    )
    label = models.CharField(max_length=100)
    value = models.SlugField()
    price_delta_amount = models.IntegerField(
        default=0, help_text="Can be positive or negative. In bani.",
    )
    color_hex = models.CharField(
        max_length=7, blank=True, help_text="For color options, e.g. #C9A227.",
    )
    image = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    # Optional: shape/finish that affects production time.
    extra_production_days = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "label"]
        unique_together = [("group", "value")]

    def __str__(self):
        return f"{self.group.name}: {self.label}"


class ProductInputField(models.Model):
    class FieldType(models.TextChoices):
        SHORT_TEXT = "short_text", "Short text"
        LONG_TEXT = "long_text", "Long text"
        NUMBER = "number", "Number"
        DATE = "date", "Date"
        EMAIL = "email", "Email"
        FILE = "file", "File upload"
        BOOLEAN = "boolean", "Boolean"

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="input_fields",
    )
    key = models.SlugField(
        help_text="Stable API key, e.g. message_text, ornament_words."
    )
    label = models.CharField(max_length=120)
    field_type = models.CharField(max_length=30, choices=FieldType.choices)
    required = models.BooleanField(default=False)
    help_text = models.TextField(blank=True)
    placeholder = models.CharField(max_length=255, blank=True)
    min_chars = models.PositiveIntegerField(null=True, blank=True)
    max_chars = models.PositiveIntegerField(null=True, blank=True)
    min_words = models.PositiveIntegerField(null=True, blank=True)
    max_words = models.PositiveIntegerField(null=True, blank=True)
    validation_regex = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "label"]
        unique_together = [("product", "key")]

    def __str__(self):
        return f"{self.product.title} — {self.label}"


class TextByPagePricing(models.Model):
    class PricingMode(models.TextChoices):
        PER_PAGE = "per_page", "Pe pagină"
        PER_WORD = "per_word", "Pe cuvânt"
        PER_WORD_BLOCK = "per_word_block", "Pe X cuvinte"
        PER_CHARACTER = "per_character", "Pe caracter"

    product = models.OneToOneField(
        Product, on_delete=models.CASCADE, related_name="text_pricing",
    )
    text_field_key = models.SlugField(
        default="message_text",
        help_text="Which ProductInputField contains the priced text.",
    )
    pricing_mode = models.CharField(
        max_length=20,
        choices=PricingMode.choices,
        default=PricingMode.PER_PAGE,
    )
    words_per_page = models.PositiveIntegerField(default=100)
    average_words_per_page = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=(
            "Cuvinte pe pagină în medie — la mod „Pe X cuvinte”: prag inclus în "
            "prețul de bază; folosit și pentru estimarea paginilor afișată clientului."
        ),
    )
    price_per_unit_amount = models.PositiveIntegerField(
        help_text="In bani. Preț pe pagină/cuvânt/caracter (după prima pagină, la mod pagină).",
    )
    minimum_pages = models.PositiveIntegerField(default=1)
    maximum_pages = models.PositiveIntegerField(null=True, blank=True)
    setup_fee_amount = models.PositiveIntegerField(default=0)
    round_up = models.BooleanField(default=True)

    @property
    def price_per_page_amount(self):
        """Backward-compatible alias."""
        return self.price_per_unit_amount

    class Meta:
        verbose_name_plural = "text-by-page pricing"

    def __str__(self):
        return f"{self.product.title}: {self.words_per_page} words/page"

    def clean(self):
        """Guarantee text_field_key points at a real input field on this product."""
        super().clean()
        if self.product_id:
            exists = self.product.input_fields.filter(key=self.text_field_key).exists()
            if not exists:
                raise ValidationError({
                    "text_field_key": (
                        f"No ProductInputField with key '{self.text_field_key}' "
                        f"exists on '{self.product}'. Create the input field first."
                    )
                })
        if self.words_per_page == 0:
            raise ValidationError({"words_per_page": "Cannot be zero."})


class ProductRecommendation(models.Model):
    """Manual upsell / cross-sell link between two products."""

    class Kind(models.TextChoices):
        UPSELL = "upsell", "Upsell"
        CROSS_SELL = "cross_sell", "Cross-sell"

    source = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="outgoing_recommendations",
    )
    target = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="incoming_recommendations",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        unique_together = [("source", "target", "kind")]
        indexes = [
            models.Index(fields=["source", "kind", "sort_order"]),
        ]

    def __str__(self):
        return f"{self.source.title} → {self.target.title} ({self.kind})"

    def clean(self):
        super().clean()
        if self.source_id and self.target_id and self.source_id == self.target_id:
            raise ValidationError({"target": "Un produs nu poate fi recomandat către el însuși."})
