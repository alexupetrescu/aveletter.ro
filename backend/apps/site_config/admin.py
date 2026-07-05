from django.contrib import admin

from .models import SiteConfig


@admin.register(SiteConfig)
class SiteConfigAdmin(admin.ModelAdmin):
    list_display = ["site_name", "domain", "maintenance_mode", "updated_at"]

    def has_add_permission(self, request):
        # Single-row config.
        return not SiteConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
