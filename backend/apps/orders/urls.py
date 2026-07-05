from django.urls import path

from .views import (
    CartItemDetailView,
    CartItemsView,
    CartItemUploadView,
    CartView,
    OrderDetailView,
    OrderInvoiceView,
)

cart_urlpatterns = [
    path("", CartView.as_view(), name="cart"),
    path("items/", CartItemsView.as_view(), name="cart-items"),
    path("items/<int:item_id>/", CartItemDetailView.as_view(), name="cart-item-detail"),
    path("items/<int:item_id>/uploads/", CartItemUploadView.as_view(), name="cart-item-uploads"),
]

order_urlpatterns = [
    path("<str:order_number>/", OrderDetailView.as_view(), name="order-detail"),
    path("<str:order_number>/invoice/", OrderInvoiceView.as_view(), name="order-invoice"),
]
