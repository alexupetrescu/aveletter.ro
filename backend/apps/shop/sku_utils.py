"""Shared SKU normalization and uniqueness checks across products and variants."""

from __future__ import annotations

from apps.shop.models import Product, ProductVariant


def normalize_sku(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped or None


def sku_conflict_message(
    sku: str | None,
    *,
    exclude_product_id: int | None = None,
    exclude_variant_id: int | None = None,
) -> str | None:
    """Return a user-facing error if *sku* is taken, else ``None``."""
    sku = normalize_sku(sku)
    if not sku:
        return None

    product_qs = Product.objects.filter(sku=sku)
    if exclude_product_id is not None:
        product_qs = product_qs.exclude(pk=exclude_product_id)
    conflict = product_qs.first()
    if conflict is not None:
        return f'SKU „{sku}" este folosit de produsul „{conflict.title}".'

    variant_qs = ProductVariant.objects.filter(sku=sku).select_related("product")
    if exclude_variant_id is not None:
        variant_qs = variant_qs.exclude(pk=exclude_variant_id)
    conflict = variant_qs.first()
    if conflict is not None:
        return (
            f'SKU „{sku}" este folosit de varianta „{conflict.name}" '
            f"({conflict.product.title})."
        )

    return None


def sku_is_available(
    sku: str | None,
    *,
    exclude_product_id: int | None = None,
    exclude_variant_id: int | None = None,
) -> bool:
    return sku_conflict_message(
        sku,
        exclude_product_id=exclude_product_id,
        exclude_variant_id=exclude_variant_id,
    ) is None
