from django.urls import path

from .views import SiteConfigView

urlpatterns = [
    path("", SiteConfigView.as_view(), name="site-config"),
]
