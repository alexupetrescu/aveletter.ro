from rest_framework import serializers

from .models import HomeHero, SiteConfig


def _asset_url(asset, request):
    if asset and asset.file:
        url = asset.file.url
        return request.build_absolute_uri(url) if request else url
    return None


class HomeHeroSerializer(serializers.ModelSerializer):
    background_image_url = serializers.SerializerMethodField()

    class Meta:
        model = HomeHero
        fields = [
            "tagline",
            "title",
            "copy",
            "primary_button_label",
            "primary_button_url",
            "secondary_button_label",
            "secondary_button_url",
            "background_image_url",
        ]

    def get_background_image_url(self, obj):
        return _asset_url(obj.background_image, self.context.get("request"))


class SiteConfigSerializer(serializers.ModelSerializer):
    default_og_image_url = serializers.SerializerMethodField()
    hero = serializers.SerializerMethodField()

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
            "delivery_fee_amount",
            "free_shipping_threshold_amount",
            "maintenance_mode",
            "hero",
        ]

    def get_default_og_image_url(self, obj):
        return _asset_url(obj.default_og_image, self.context.get("request"))

    def get_hero(self, obj):
        hero = HomeHero.get_solo()
        return HomeHeroSerializer(hero, context=self.context).data
