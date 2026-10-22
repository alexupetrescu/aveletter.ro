"""Availability checks shared by cart writes and locked checkout transactions."""
from django.core.exceptions import ValidationError
from django.db.models import F, Sum

from .models import Product, ProductVariant


def validate_stock(product, *, variant=None, quantity=1, product_quantity=None,
                   require_variant=True):
    if not product.is_live:
        raise ValidationError(f"Produsul „{product.title}” nu mai este disponibil.")
    if variant is not None and (variant.product_id != product.pk or not variant.is_active):
        raise ValidationError("Varianta selectată nu mai este disponibilă.")
    if require_variant and variant is None and product.variants.filter(is_active=True).exists():
        raise ValidationError("Alege o variantă.")
    if quantity < 1:
        raise ValidationError("Cantitatea trebuie să fie un număr întreg pozitiv.")
    total = product_quantity if product_quantity is not None else quantity
    if product.stock_quantity is not None and total > product.stock_quantity:
        raise ValidationError(
            f"Stoc insuficient pentru „{product.title}” "
            f"({product.stock_quantity} buc. disponibile)."
        )
    if variant and variant.track_stock and quantity > variant.stock_quantity:
        raise ValidationError(
            f"Stoc insuficient pentru „{product.title} — {variant.name}” "
            f"({variant.stock_quantity} buc. disponibile)."
        )


def validate_cart_stock(cart, product, *, variant=None, quantity=1, exclude_item_id=None):
    others = cart.items.filter(product=product).exclude(pk=exclude_item_id)
    product_total = (others.aggregate(total=Sum("quantity"))["total"] or 0) + quantity
    variant_total = quantity
    if variant:
        variant_total += others.filter(variant=variant).aggregate(total=Sum("quantity"))["total"] or 0
    validate_stock(product, variant=variant, quantity=variant_total, product_quantity=product_total)


def restore_order_stock(order):
    """Caller holds the order lock. Legacy orders have zero reserved quantities."""
    lines = list(order.lines.order_by("product_id", "variant_id", "pk"))
    # Lock in the same order as checkout, including when multiple lines share stock.
    products = {
        p.pk: p for p in Product.objects.select_for_update().filter(
            pk__in=[line.product_id for line in lines],
        ).order_by("pk")
    }
    variants = {
        v.pk: v for v in ProductVariant.objects.select_for_update().filter(
            pk__in=[line.variant_id for line in lines],
        ).order_by("pk")
    }
    for line in lines:
        product = products.get(line.product_id)
        if line.reserved_product_quantity and product and product.stock_quantity is not None:
            Product.objects.filter(pk=product.pk).update(
                stock_quantity=F("stock_quantity") + line.reserved_product_quantity,
            )
        if line.reserved_variant_quantity and line.variant_id in variants:
            ProductVariant.objects.filter(pk=line.variant_id).update(
                stock_quantity=F("stock_quantity") + line.reserved_variant_quantity,
            )
        if line.reserved_product_quantity or line.reserved_variant_quantity:
            line.reserved_product_quantity = line.reserved_variant_quantity = 0
            line.save(update_fields=["reserved_product_quantity", "reserved_variant_quantity"])
