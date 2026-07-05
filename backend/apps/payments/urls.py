from django.urls import path

from .views import CheckoutStartView, StripeWebhookView

checkout_urlpatterns = [
    path("start/", CheckoutStartView.as_view(), name="checkout-start"),
]

webhook_urlpatterns = [
    path("stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
]
