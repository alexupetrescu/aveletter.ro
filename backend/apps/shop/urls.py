from django.urls import path

from .views import (
    ProductCategoryListView,
    ProductDetailView,
    ProductListView,
    ProductQuoteView,
    SearchView,
)

urlpatterns = [
    path("categories/", ProductCategoryListView.as_view(), name="category-list"),
    path("products/", ProductListView.as_view(), name="product-list"),
    path("products/<slug:slug>/", ProductDetailView.as_view(), name="product-detail"),
    path("products/<slug:slug>/quote/", ProductQuoteView.as_view(), name="product-quote"),
    path("search/", SearchView.as_view(), name="search"),
]
