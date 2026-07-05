from rest_framework import serializers

from .models import SiteConfig


class SiteConfigSerializer(serializers.ModelSerializer):
    default_og_image_url = serializers.SerializerMethodField()

    class Meta:
        model = SiteConfig
        fields = [
            "site_name",
            "domain",
            "contact_email",
            "contact_phone",
            "instagram_url",
            "facebook_url",
            "default_seo_title",
            "default_seo_description",
            "default_og_image_url",
            "announcement_enabled",
            "announcement_text",
            "free_shipping_threshold_amount",
            "maintenance_mode",
        ]

    def get_default_og_image_url(self, obj):
        if obj.default_og_image and obj.default_og_image.file:
            request = self.context.get("request")
            url = obj.default_og_image.file.url
            return request.build_absolute_uri(url) if request else url
        return None
