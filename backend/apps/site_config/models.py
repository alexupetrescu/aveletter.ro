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
    free_shipping_threshold_amount = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="In bani. Example: 30000 = 300 RON.",
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
