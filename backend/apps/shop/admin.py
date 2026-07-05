from django.contrib import admin

from .models import (
    Product,
    ProductCategory,
    ProductImage,
    ProductInputField,
    ProductOption,
    ProductOptionGroup,
    ProductVariant,
    TextByPagePricing,
)


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "parent", "sort_order"]
    list_filter = ["parent"]
    prepopulated_fields = {"slug": ("name",)}


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    autocomplete_fields = ["asset"]


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0


class ProductInputFieldInline(admin.StackedInline):
    model = ProductInputField
    extra = 0
    prepopulated_fields = {"key": ("label",)}


class ProductOptionGroupInline(admin.TabularInline):
    """Groups only; options are managed on the ProductOptionGroup admin page."""
    model = ProductOptionGroup
    extra = 0
    show_change_link = True
    prepopulated_fields = {"slug": ("name",)}


class TextByPagePricingInline(admin.StackedInline):
    model = TextByPagePricing
    extra = 0


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = [
        "title", "product_type", "category", "status",
        "base_price_display", "is_featured",
    ]
    list_filter = ["status", "product_type", "category", "is_featured"]
    search_fields = ["title", "short_description", "description_text"]
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ["created_at", "updated_at"]
    inlines = [
        ProductImageInline,
        ProductVariantInline,
        ProductInputFieldInline,
        ProductOptionGroupInline,
        TextByPagePricingInline,
    ]

    @admin.display(description="Base price")
    def base_price_display(self, obj):
        return f"{obj.base_price_amount / 100:.2f} {obj.currency}"


class ProductOptionInline(admin.TabularInline):
    model = ProductOption
    extra = 0
    prepopulated_fields = {"value": ("label",)}


@admin.register(ProductOptionGroup)
class ProductOptionGroupAdmin(admin.ModelAdmin):
    list_display = ["name", "product", "display_type", "required", "sort_order"]
    list_filter = ["display_type", "required"]
    search_fields = ["name", "product__title"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ProductOptionInline]
