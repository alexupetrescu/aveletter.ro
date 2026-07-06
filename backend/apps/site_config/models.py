from django.db import models


class SiteConfig(models.Model):
    site_name = models.CharField(max_length=100, default="Ave Letter")
    domain = models.CharField(max_length=255, default="aveletter.ro")
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=50, blank=True)
    instagram_url = models.URLField(blank=True)
    facebook_url = models.URLField(blank=True)
    default_seo_title = models.CharField(max_length=70, blank=True)
    default_seo_description = models.CharField(max_length=160, blank=True)
    default_og_image = models.ForeignKey(
        "media_library.MediaAsset",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    announcement_enabled = models.BooleanField(default=False)
    announcement_text = models.CharField(max_length=255, blank=True)
    delivery_fee_amount = models.PositiveIntegerField(
        default=0,
        help_text="In bani. Ex: 2500 = 25 RON. Taxă standard de livrare.",
    )
    free_shipping_threshold_amount = models.PositiveIntegerField(
        null=True, blank=True,
        help_text=(
            "In bani. Ex: 30000 = 300 RON. Dacă subtotalul produselor "
            "≥ acest prag, taxa de livrare nu se aplică (0 lei)."
        ),
    )
    maintenance_mode = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "site configuration"
        verbose_name_plural = "site configuration"

    def __str__(self):
        return self.site_name

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj

    def shipping_amount_for_subtotal(self, subtotal_gross: int) -> int:
        """Delivery fee in bani; 0 if subtotal ≥ free_shipping_threshold_amount."""
        fee = self.delivery_fee_amount or 0
        if not fee:
            return 0
        threshold = self.free_shipping_threshold_amount
        if threshold is not None and subtotal_gross >= threshold:
            return 0
        return fee


class HomeHero(models.Model):
    """Singleton homepage hero block."""

    background_image = models.ForeignKey(
        "media_library.MediaAsset",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    tagline = models.CharField(max_length=120, default="scris cu suflet")
    title = models.CharField(max_length=200, default="Cadouri personalizate")
    copy = models.TextField(
        blank=True,
        default=(
            "Împreună scriem cadoul potrivit. La Ave Letter Studio găsești "
            "idei de cadouri caligrafiate manual, gândite pentru oamenii dragi."
        ),
    )
    primary_button_label = models.CharField(max_length=80, default="VEZI PRODUSELE")
    primary_button_url = models.CharField(max_length=255, default="/shop")
    secondary_button_label = models.CharField(max_length=80, default="SERVICII")
    secondary_button_url = models.CharField(max_length=255, default="#servicii")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "homepage hero"
        verbose_name_plural = "homepage hero"

    def __str__(self):
        return "Homepage hero"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj


class HomeInstagram(models.Model):
    """Singleton — ordered images for the homepage Instagram strip."""

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "homepage Instagram strip"
        verbose_name_plural = "homepage Instagram strip"

    def __str__(self):
        return "Instagram pagină principală"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj


class HomeInstagramImage(models.Model):
    strip = models.ForeignKey(
        HomeInstagram,
        on_delete=models.CASCADE,
        related_name="images",
    )
    asset = models.ForeignKey(
        "media_library.MediaAsset",
        on_delete=models.CASCADE,
        related_name="+",
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["strip", "asset"],
                name="unique_home_instagram_asset",
            ),
        ]

    def __str__(self):
        return f"Instagram #{self.sort_order}"
