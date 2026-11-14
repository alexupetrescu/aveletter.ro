"""Runtime health checks and private media gateway, followed by original URLs."""

from importlib import import_module
from django.conf import settings
from django.http import JsonResponse
from django.urls import path,re_path
from production_middleware import optimizer_authorization,protected_media

urlpatterns=[path("api/health/",lambda request:JsonResponse({"status":"ok"}))]
if settings.PROJECT=="avestudio":
    urlpatterns += [path("api/_runtime/image-authorization/",optimizer_authorization),re_path(r"^media/(?P<path>.*)$",protected_media)]
urlpatterns += import_module("backend.urls" if settings.PROJECT=="avestudio" else "config.urls").urlpatterns
