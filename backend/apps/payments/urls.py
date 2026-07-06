from django.urls import path

from .views import CheckoutResumeView, CheckoutStartView, StripeWebhookView

checkout_urlpatterns = [
    path("start/", CheckoutStartView.as_view(), name="checkout-start"),
    path("resume/", CheckoutResumeView.as_view(), name="checkout-resume"),
]

webhook_urlpatterns = [
    path("stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
]
