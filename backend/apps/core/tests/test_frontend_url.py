from django.test import RequestFactory, TestCase, override_settings

from apps.core.frontend_url import resolve_frontend_url
from apps.site_config.models import SiteConfig


class ResolveFrontendUrlTests(TestCase):
    def setUp(self):
        SiteConfig.objects.all().delete()
        SiteConfig.objects.create(domain="aveletter.ro")

    @override_settings(FRONTEND_URL="http://localhost:3020")
    def test_uses_site_domain_when_env_is_localhost(self):
        self.assertEqual(resolve_frontend_url(), "https://aveletter.ro")

    @override_settings(FRONTEND_URL="https://shop.example.com")
    def test_explicit_env_overrides_domain(self):
        self.assertEqual(resolve_frontend_url(), "https://shop.example.com")

    @override_settings(
        FRONTEND_URL="http://localhost:3020",
        CORS_ALLOWED_ORIGINS=["https://staging.aveletter.ro"],
    )
    def test_request_origin_used_when_env_localhost(self):
        request = RequestFactory().post(
            "/api/checkout/start/",
            HTTP_ORIGIN="https://staging.aveletter.ro",
        )
        self.assertEqual(
            resolve_frontend_url(request),
            "https://staging.aveletter.ro",
        )

    @override_settings(FRONTEND_URL="http://localhost:3020")
    def test_localhost_origin_allowed_in_dev(self):
        request = RequestFactory().post(
            "/api/checkout/start/",
            HTTP_ORIGIN="http://localhost:3020",
        )
        self.assertEqual(
            resolve_frontend_url(request),
            "http://localhost:3020",
        )
