"""Helpers for product category assignments."""

from django.db.models import Prefetch

from .models import ProductCategoryAssignment


def categories_prefetch(prefix=""):
    lookup = f"{prefix}__category_assignments" if prefix else "category_assignments"
    return Prefetch(
        lookup,
        queryset=ProductCategoryAssignment.objects.select_related("category"),
    )


def primary_category_from_product(product):
    return product.primary_category


def product_category_ids(product):
    return list(
        product.category_assignments.values_list("category_id", flat=True),
    )
