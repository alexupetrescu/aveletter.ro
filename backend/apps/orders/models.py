import secrets

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


# ---------------------------------------------------------------------------
# VAT / TVA
# ---------------------------------------------------------------------------

class VatRate(models.Model):
    """A named VAT rate. Standard RO rate, reduced rates, and exempt all live here."""

    name = models.CharField(max_length=50)              # "Standard 19%", "Redus 9%", "Scutit"
    rate_bp = models.PositiveIntegerField(
        help_text="Rate in basis points. 1900 = 19%. 900 = 9%. 0 = exempt/0%.",
    )
    is_exempt = models.BooleanField(
        default=False, help_text="True for neplătitor / scutit — legal mention, not a %.",
    )
    legal_mention = models.CharField(
        max_length=255, blank=True,
        help_text="Printed on invoice, e.g. 'Neplătitor de TVA' or 'Scutit conform art. ...'.",
    )
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class TaxConfig(models.Model):
    """
    Single-row fiscal config. The master switch.
    TVA-off today -> default_vat_rate points at an exempt VatRate.
    TVA-on later  -> flip vat_enabled, point default at 'Standard 19%'.
    """

    vat_enabled = models.BooleanField(
        default=False,
        help_text="OFF = neplătitor de TVA. Prices charged as-is, 0 VAT on invoices.",
    )
    prices_include_vat = models.BooleanField(
        default=True,
        help_text=(
            "When VAT is enabled: True = base_price_amount is gross (VAT-inclusive), "
            "extract VAT out of it. False = base price is net, add VAT on top."
        ),
    )
    default_vat_rate = models.ForeignKey(
        VatRate, on_delete=models.PROTECT, related_name="+",
        help_text="Applied to products with no explicit vat_rate.",
    )
    # Seller fiscal identity — printed on every invoice.
    legal_name = models.CharField(max_length=255, blank=True)
    cui = models.CharField(max_length=20, blank=True, help_text="CUI / CIF.")
    reg_com = models.CharField(max_length=50, blank=True, help_text="Nr. Reg. Com.")
    fiscal_address = models.TextField(blank=True)
    invoice_email = models.EmailField(blank=True)
    invoice_phone = models.CharField(max_length=50, blank=True)
    iban = models.CharField(max_length=50, blank=True)
    bank = models.CharField(max_length=100, blank=True)
    swift = models.CharField(max_length=30, blank=True)
    share_capital = models.CharField(max_length=100, blank=True)
    invoice_logo = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    invoice_footer = models.TextField(blank=True)
    payment_term_days = models.PositiveSmallIntegerField(default=15)
    default_invoice_series = models.ForeignKey(
        "InvoiceSeries", null=True, blank=True, on_delete=models.PROTECT, related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "tax configuration"
        verbose_name_plural = "tax configuration"

    def __str__(self):
        return "Tax configuration"

    @classmethod
    def get_solo(cls):
        config = cls.objects.select_related("default_vat_rate").first()
        if config is not None:
            return config
        exempt, _ = VatRate.objects.get_or_create(
            name="Neplătitor de TVA",
            defaults={
                "rate_bp": 0,
                "is_exempt": True,
                "legal_mention": "Neplătitor de TVA conform art. 310 din Codul Fiscal",
            },
        )
        return cls.objects.create(
            vat_enabled=False,
            prices_include_vat=True,
            default_vat_rate=exempt,
            legal_name="Ave Letter Studio",
        )


# ---------------------------------------------------------------------------
# Address
# ---------------------------------------------------------------------------

class Address(models.Model):
    is_company = models.BooleanField(default=False)
    company_name = models.CharField(max_length=255, blank=True)
    cui = models.CharField(max_length=30, blank=True)
    reg_com = models.CharField(max_length=50, blank=True)
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=50)
    email = models.EmailField(blank=True)
    country = models.CharField(max_length=2, default="RO")
    county = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20, blank=True)
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "addresses"

    def __str__(self):
        return f"{self.full_name}, {self.city}"


# ---------------------------------------------------------------------------
# Cart
# ---------------------------------------------------------------------------

class Cart(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
    )
    session_key = models.CharField(max_length=100, blank=True, db_index=True)
    currency = models.CharField(max_length=3, default="RON")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart #{self.pk}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("shop.Product", on_delete=models.PROTECT)
    variant = models.ForeignKey(
        "shop.ProductVariant", null=True, blank=True, on_delete=models.PROTECT,
    )
    selected_options = models.ManyToManyField("shop.ProductOption", blank=True)
    quantity = models.PositiveIntegerField(default=1)
    inputs = models.JSONField(default=dict, blank=True)
    price_breakdown = models.JSONField(default=dict, blank=True)
    unit_price_amount = models.PositiveIntegerField(default=0)
    currency = models.CharField(max_length=3, default="RON")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.quantity} x {self.product}"


class CartUpload(models.Model):
    cart_item = models.ForeignKey(
        CartItem, on_delete=models.CASCADE, related_name="uploads",
    )
    field_key = models.SlugField(help_text="Matches the ProductInputField.key.")
    file = models.FileField(upload_to="cart_uploads/%Y/%m/")
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveBigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.field_key}: {self.original_filename}"


# ---------------------------------------------------------------------------
# Order
# ---------------------------------------------------------------------------

def generate_order_number():
    """AVE-YYYYMMDD-XXXX, random suffix, retried on collision by the caller."""
    date_part = timezone.now().strftime("%Y%m%d")
    suffix = secrets.token_hex(2).upper()
    return f"AVE-{date_part}-{suffix}"


class Order(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_PAYMENT = "pending_payment", "Pending payment"
        PAID = "paid", "Paid"
        IN_PRODUCTION = "in_production", "In production"
        READY_TO_SHIP = "ready_to_ship", "Ready to ship"
        SHIPPED = "shipped", "Shipped"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    order_number = models.CharField(max_length=30, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
    )
    email = models.EmailField()
    phone = models.CharField(max_length=50, blank=True)
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.DRAFT,
    )
    billing_address = models.ForeignKey(
        Address, null=True, blank=True, on_delete=models.PROTECT, related_name="+",
    )
    shipping_address = models.ForeignKey(
        Address, null=True, blank=True, on_delete=models.PROTECT, related_name="+",
    )
    currency = models.CharField(max_length=3, default="RON")
    # Frozen money totals (bani). With VAT split so invoices read straight off the order.
    subtotal_net_amount = models.PositiveIntegerField(default=0)
    subtotal_amount = models.PositiveIntegerField(default=0)   # gross subtotal
    shipping_amount = models.PositiveIntegerField(default=0)
    discount_amount = models.PositiveIntegerField(default=0)
    vat_amount = models.PositiveIntegerField(default=0)
    total_amount = models.PositiveIntegerField(default=0)      # gross grand total
    # Frozen VAT treatment at purchase time.
    vat_enabled_snapshot = models.BooleanField(default=False)
    vat_breakdown = models.JSONField(
        default=dict, blank=True,
        help_text="e.g. {'1900': {'net': ..., 'vat': ...}} keyed by rate_bp.",
    )
    customer_notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    awb = models.CharField(max_length=100, blank=True)
    courier = models.CharField(max_length=100, blank=True)
    tracking_url = models.URLField(blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    invoice_error = models.TextField(blank=True)
    placed_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_resume_email_sent_at = models.DateTimeField(
        null=True, blank=True,
        help_text="When the customer was emailed a link to resume Stripe payment.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.order_number


class OrderLine(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(
        "shop.Product", null=True, blank=True, on_delete=models.SET_NULL,
    )
    variant = models.ForeignKey(
        "shop.ProductVariant", null=True, blank=True, on_delete=models.SET_NULL,
    )
    product_title = models.CharField(max_length=255)
    product_slug = models.SlugField(max_length=255, blank=True)
    variant_name = models.CharField(max_length=100, blank=True)
    sku = models.CharField(max_length=100, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    # Money, frozen. Net/VAT/gross so invoicing never recomputes from live products.
    unit_price_amount = models.PositiveIntegerField()      # gross unit
    line_total_amount = models.PositiveIntegerField()      # gross line
    unit_net_amount = models.PositiveIntegerField(default=0)
    line_net_amount = models.PositiveIntegerField(default=0)
    line_vat_amount = models.PositiveIntegerField(default=0)
    vat_rate_bp = models.PositiveIntegerField(default=0)
    vat_is_exempt = models.BooleanField(default=True)
    vat_legal_mention = models.CharField(max_length=255, blank=True)
    currency = models.CharField(max_length=3, default="RON")
    selected_options_snapshot = models.JSONField(default=list, blank=True)
    inputs_snapshot = models.JSONField(default=dict, blank=True)
    price_breakdown = models.JSONField(default=dict, blank=True)
    production_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.quantity} x {self.product_title}"


# ---------------------------------------------------------------------------
# Invoicing / ANAF e-Factura
# ---------------------------------------------------------------------------

class InvoiceSeries(models.Model):
    """A named series, e.g. 'AVE'. Each series has its own running counter."""

    code = models.CharField(max_length=10, unique=True)   # e.g. "AVE"
    name = models.CharField(max_length=100, blank=True)
    next_number = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "invoice series"

    def __str__(self):
        return self.code

    @transaction.atomic
    def reserve_number(self):
        """Atomically claim the next gapless number. Row-locks the series."""
        series = InvoiceSeries.objects.select_for_update().get(pk=self.pk)
        number = series.next_number
        series.next_number = number + 1
        series.save(update_fields=["next_number"])
        return number


class Invoice(models.Model):
    class Kind(models.TextChoices):
        INVOICE = "invoice", "Invoice (factură)"
        STORNO = "storno", "Storno / credit note"

    class EFacturaStatus(models.TextChoices):
        NOT_SENT = "not_sent", "Not sent"
        QUEUED = "queued", "Queued for submission"
        SENT = "sent", "Sent to ANAF"
        ACCEPTED = "accepted", "Accepted by ANAF"
        REJECTED = "rejected", "Rejected by ANAF"

    order = models.ForeignKey(
        Order, on_delete=models.PROTECT, related_name="invoices",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.INVOICE)
    series = models.ForeignKey(InvoiceSeries, on_delete=models.PROTECT)
    number = models.PositiveIntegerField()
    issued_at = models.DateTimeField()
    # Frozen fiscal snapshot — mirrors OrderLine totals at issue time.
    currency = models.CharField(max_length=3, default="RON")
    net_amount = models.PositiveIntegerField()        # ex-VAT, in bani
    vat_amount = models.PositiveIntegerField()        # in bani
    gross_amount = models.PositiveIntegerField()      # net + vat, in bani
    # Full immutable document snapshot (seller, buyer, lines, VAT breakdown).
    snapshot = models.JSONField(default=dict)
    due_date = models.DateField(null=True, blank=True)
    pdf_data = models.BinaryField(null=True, blank=True, editable=False)
    # e-Factura lifecycle
    efactura_status = models.CharField(
        max_length=20, choices=EFacturaStatus.choices, default=EFacturaStatus.NOT_SENT,
    )
    efactura_upload_id = models.CharField(max_length=100, blank=True)
    efactura_message = models.TextField(blank=True)
    # For storno: which invoice this reverses.
    reverses = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversed_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("series", "number")]
        ordering = ["-issued_at"]

    def __str__(self):
        return self.snapshot.get("number_display") or f"{self.series.code}-{self.number:06d}"


class NotificationConfig(models.Model):
    """Private settings shared by CRM and Django admin; SMTP stays in the environment."""

    staff_notifications_enabled = models.BooleanField(default=True)
    order_recipients = models.JSONField(default=list, blank=True)
    sender_name = models.CharField(max_length=100, default="Ave Letter")
    reply_to = models.EmailField(blank=True)

    @classmethod
    def get_solo(cls):
        return cls.objects.get_or_create(pk=1)[0]

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(pk=1), name="single_notification_config")]

    def __str__(self):
        return "Notificări și emailuri"


class EmailTemplate(models.Model):
    key = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    enabled = models.BooleanField(default=True)
    subject = models.CharField(max_length=255)
    body = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        from .notifications import validate_template
        validate_template(self.subject, self.body)

    def __str__(self):
        return self.name


class OrderEvent(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    key = models.CharField(max_length=40)
    from_status = models.CharField(max_length=30, blank=True)
    to_status = models.CharField(max_length=30, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]


class OutgoingEmail(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "În așteptare"
        SENDING = "sending", "Se trimite"
        SENT = "sent", "Trimis"
        FAILED = "failed", "Eșuat"
        SKIPPED = "skipped", "Omis"
        UNCERTAIN = "uncertain", "Rezultat necunoscut"

    order = models.ForeignKey(Order, null=True, blank=True, on_delete=models.CASCADE, related_name="emails")
    event = models.ForeignKey(OrderEvent, null=True, blank=True, on_delete=models.SET_NULL, related_name="emails")
    invoice = models.ForeignKey(Invoice, null=True, blank=True, on_delete=models.PROTECT, related_name="emails")
    template_key = models.CharField(max_length=40)
    idempotency_key = models.CharField(max_length=200, unique=True)
    recipient = models.EmailField()
    from_email = models.CharField(max_length=255)
    reply_to = models.EmailField(blank=True)
    subject = models.CharField(max_length=255)
    body = models.TextField()
    html_body = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    claimed_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]


# ---------------------------------------------------------------------------
# Customer profile (merged into orders for now)
# ---------------------------------------------------------------------------

class CustomerProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="customer_profile",
    )
    phone = models.CharField(max_length=50, blank=True)
    accepts_marketing = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.user.get_username()
