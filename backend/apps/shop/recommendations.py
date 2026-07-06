"""Upsell / cross-sell resolution for shop and CRM."""

from __future__ import annotations

from django.db.models import Case, Count, IntegerField, Q, When

from apps.orders.models import OrderLine

from .models import Product, ProductRecommendation

MAX_UPSELLS = 4
MAX_CROSS_SELLS = 4


def _live_products(exclude_ids: set[int] | None = None):
    qs = Product.objects.live().select_related("category", "featured_image")
    if exclude_ids:
        qs = qs.exclude(pk__in=exclude_ids)
    return qs


def _manual_targets(product: Product, kind: str) -> list[Product]:
    return [
        rec.target
        for rec in (
            ProductRecommendation.objects.filter(source=product, kind=kind)
            .select_related("target__category", "target__featured_image")
            .order_by("sort_order", "id")
        )
        if rec.target.is_live
    ]


def _co_purchased_products(product: Product, limit: int = 8) -> list[Product]:
    order_ids = OrderLine.objects.filter(product=product).values_list("order_id", flat=True)
    if not order_ids:
        return []

    rows = (
        OrderLine.objects.filter(order_id__in=order_ids)
        .exclude(product=product)
        .exclude(product__isnull=True)
        .values("product_id")
        .annotate(freq=Count("id"))
        .order_by("-freq")[:limit]
    )
    ids = [row["product_id"] for row in rows]
    if not ids:
        return []

    order = Case(
        *[When(pk=pk, then=pos) for pos, pk in enumerate(ids)],
        output_field=IntegerField(),
    )
    return list(Product.objects.live().filter(pk__in=ids).order_by(order))


def auto_upsell_candidates(
    product: Product,
    *,
    limit: int = MAX_UPSELLS,
    exclude_ids: set[int] | None = None,
) -> list[Product]:
    """Higher-value alternatives: same category/type first, then featured."""
    exclude = {product.pk, *(exclude_ids or set())}
    found: list[Product] = []
    base_price = product.base_price_amount

    def take(qs, remaining):
        for item in qs:
            if item.pk in exclude or item in found:
                continue
            found.append(item)
            exclude.add(item.pk)
            if len(found) >= limit:
                return
            remaining -= 1
            if remaining <= 0:
                return

    remaining = limit
    if product.category_id:
        take(
            _live_products(exclude).filter(
                category=product.category,
                base_price_amount__gt=base_price,
            ).order_by("base_price_amount")[:remaining],
            remaining,
        )
        remaining = limit - len(found)

    if remaining > 0:
        take(
            _live_products(exclude).filter(
                product_type=product.product_type,
                base_price_amount__gt=base_price,
            ).order_by("base_price_amount")[:remaining],
            remaining,
        )
        remaining = limit - len(found)

    if remaining > 0:
        take(
            _live_products(exclude).filter(
                is_featured=True,
                base_price_amount__gt=base_price,
            ).order_by("-base_price_amount")[:remaining],
            remaining,
        )

    return found[:limit]


def auto_cross_sell_candidates(
    product: Product,
    *,
    limit: int = MAX_CROSS_SELLS,
    exclude_ids: set[int] | None = None,
) -> list[Product]:
    """Complementary products: co-purchase history, then same category."""
    exclude = {product.pk, *(exclude_ids or set())}
    found: list[Product] = []

    def add_items(items):
        for item in items:
            if item.pk in exclude or item in found:
                continue
            found.append(item)
            exclude.add(item.pk)
            if len(found) >= limit:
                return

    add_items(_co_purchased_products(product, limit=limit))

    if len(found) < limit and product.category_id:
        sibling_q = Q(category=product.category)
        if product.category.parent_id:
            sibling_q |= Q(category__parent=product.category.parent)
        add_items(
            _live_products(exclude).filter(sibling_q).order_by("-is_featured", "title")[
                : limit - len(found)
            ],
        )

    if len(found) < limit:
        add_items(
            _live_products(exclude).filter(product_type=product.product_type)
            .exclude(base_price_amount__gt=product.base_price_amount)
            .order_by("-is_featured", "title")[: limit - len(found)],
        )

    if len(found) < limit:
        add_items(
            _live_products(exclude).filter(is_featured=True).order_by("title")[
                : limit - len(found)
            ],
        )

    return found[:limit]


def resolve_recommendations(
    product: Product,
    kind: str,
    *,
    limit: int | None = None,
) -> list[Product]:
    """Manual picks first, then auto-fill remaining slots."""
    if kind == ProductRecommendation.Kind.UPSELL:
        max_items = limit or MAX_UPSELLS
        auto_fn = auto_upsell_candidates
    else:
        max_items = limit or MAX_CROSS_SELLS
        auto_fn = auto_cross_sell_candidates

    manual = _manual_targets(product, kind)
    result = manual[:max_items]
    if len(result) >= max_items:
        return result

    exclude = {p.pk for p in result}
    auto = auto_fn(product, limit=max_items - len(result), exclude_ids=exclude)
    return result + auto
