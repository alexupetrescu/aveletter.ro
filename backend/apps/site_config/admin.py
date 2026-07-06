from django.contrib import admin

from .models import HomeHero, HomeInstagram, HomeInstagramImage, SiteConfig


@admin.register(SiteConfig)
class SiteConfigAdmin(admin.ModelAdmin):
    list_display = ["site_name", "domain", "maintenance_mode", "updated_at"]

    def has_add_permission(self, request):
        return not SiteConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(HomeHero)
class HomeHeroAdmin(admin.ModelAdmin):
    list_display = ["title", "updated_at"]

    def has_add_permission(self, request):
        return not HomeHero.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


class HomeInstagramImageInline(admin.TabularInline):
    model = HomeInstagramImage
    extra = 0


@admin.register(HomeInstagram)
class HomeInstagramAdmin(admin.ModelAdmin):
    list_display = ["updated_at"]
    inlines = [HomeInstagramImageInline]

    def has_add_permission(self, request):
        return not HomeInstagram.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
