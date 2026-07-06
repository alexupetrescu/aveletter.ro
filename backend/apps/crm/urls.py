from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from .auth_views import CsrfView, LoginView, LogoutView, MeView

router = DefaultRouter()
# Shop
router.register("product-categories", views.ProductCategoryViewSet)
router.register("products", views.ProductViewSet)
router.register("variants", views.ProductVariantViewSet)
router.register("option-groups", views.ProductOptionGroupViewSet)
router.register("options", views.ProductOptionViewSet)
router.register("input-fields", views.ProductInputFieldViewSet)
router.register("product-images", views.ProductImageViewSet)
router.register("product-recommendations", views.ProductRecommendationViewSet)
router.register("text-pricing", views.TextByPagePricingViewSet)
# Blog
router.register("posts", views.PostViewSet)
router.register("blog-categories", views.BlogCategoryViewSet)
router.register("tags", views.TagViewSet)
router.register("redirects", views.SlugRedirectViewSet)
router.register("author-profiles", views.AuthorProfileViewSet, basename="author-profile")
# Media
router.register("media", views.MediaAssetViewSet)
router.register("media-tags", views.MediaTagViewSet)
# Orders / fiscal
router.register("orders", views.OrderViewSet)
router.register("invoices", views.InvoiceViewSet)
router.register("payments", views.PaymentViewSet)
router.register("carts", views.CartViewSet)
router.register("vat-rates", views.VatRateViewSet)
router.register("invoice-series", views.InvoiceSeriesViewSet)

urlpatterns = [
    path("auth/csrf/", CsrfView.as_view(), name="crm-csrf"),
    path("auth/login/", LoginView.as_view(), name="crm-login"),
    path("auth/logout/", LogoutView.as_view(), name="crm-logout"),
    path("auth/me/", MeView.as_view(), name="crm-me"),
    path("tax-config/", views.TaxConfigView.as_view(), name="crm-tax-config"),
    path("site-config/", views.SiteConfigCrmView.as_view(), name="crm-site-config"),
    path("home-hero/", views.HomeHeroCrmView.as_view(), name="crm-home-hero"),
    path("stats/", views.StatsView.as_view(), name="crm-stats"),
    path("", include(router.urls)),
]
