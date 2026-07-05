from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

from apps.orders.urls import cart_urlpatterns, order_urlpatterns
from apps.payments.urls import checkout_urlpatterns, webhook_urlpatterns


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/site-config/", include("apps.site_config.urls")),
    path("api/blog/", include("apps.blog.urls")),
    path("api/shop/", include("apps.shop.urls")),
    path("api/cart/", include(cart_urlpatterns)),
    path("api/orders/", include(order_urlpatterns)),
    path("api/checkout/", include(checkout_urlpatterns)),
    path("api/payments/webhook/", include(webhook_urlpatterns)),
    path("api/crm/", include("apps.crm.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
