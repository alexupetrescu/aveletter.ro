from django.contrib import admin
from django.utils.html import format_html

from .models import MediaAsset, MediaRendition, MediaTag


@admin.register(MediaTag)
class MediaTagAdmin(admin.ModelAdmin):
    list_display = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}


class MediaRenditionInline(admin.TabularInline):
    model = MediaRendition
    extra = 0
    readonly_fields = ["file", "width", "height", "format", "created_at"]
    can_delete = True


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display = ["thumbnail", "__str__", "kind", "visibility", "created_at"]
    list_display_links = ["thumbnail", "__str__"]
    list_filter = ["kind", "visibility"]
    search_fields = ["title", "alt_text", "original_filename"]
    readonly_fields = ["checksum", "size_bytes", "created_at", "preview"]
    filter_horizontal = ["tags"]
    inlines = [MediaRenditionInline]

    @admin.display(description="")
    def thumbnail(self, obj):
        if obj.kind == MediaAsset.Kind.IMAGE and obj.file:
            return format_html(
                '<img src="{}" style="height:40px;width:40px;object-fit:cover;'
                'border-radius:4px;" alt="" />',
                obj.file.url,
            )
        return ""

    @admin.display(description="Preview")
    def preview(self, obj):
        if obj.kind == MediaAsset.Kind.IMAGE and obj.file:
            return format_html(
                '<img src="{}" style="max-height:300px;max-width:100%;" alt="" />',
                obj.file.url,
            )
        return "-"

    def save_model(self, request, obj, form, change):
        if not change and not obj.uploaded_by:
            obj.uploaded_by = request.user
        if obj.file and not obj.original_filename:
            obj.original_filename = obj.file.name.rsplit("/", 1)[-1]
        if obj.file and obj.size_bytes is None:
            try:
                obj.size_bytes = obj.file.size
            except (OSError, ValueError):
                pass
        super().save_model(request, obj, form, change)
