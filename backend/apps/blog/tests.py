from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.crm.serializers import SlugRedirectCrmSerializer
from .redirects import resolve_redirect, validate_redirect_path
from .views import RedirectResolveView


class RedirectTests(SimpleTestCase):
    def test_public_serializers_expose_indexing_and_modification_fields(self):
        from .serializers import PostDetailSerializer, PostListSerializer
        from apps.shop.serializers import ProductListSerializer
        for serializer in (PostListSerializer(), PostDetailSerializer()):
            self.assertTrue({"canonical_url", "noindex", "updated_at"}.issubset(serializer.fields))
        self.assertIn("updated_at", ProductListSerializer().fields)

    def mock_routes(self, mapping):
        patcher = patch("apps.blog.redirects.SlugRedirect.objects.filter")
        query = patcher.start()
        self.addCleanup(patcher.stop)

        def lookup(**kwargs):
            from unittest.mock import Mock
            result = Mock()
            result.order_by.return_value.values_list.return_value.first.return_value = next(
                (mapping[key] for key in kwargs["old_path__in"] if key in mapping), None,
            )
            return result

        query.side_effect = lookup
        return query

    def test_paths_cannot_escape_to_external_or_private_destinations(self):
        for value in ("https://evil.example", "//evil.example", "/%2fevil.example", "/\\evil.example", "/a/../crm", "/%2e%2e/crm", "/crm", "/api/orders/", "/cart", "/checkout", "/a?x=1", "/a#part", "/a%0d%0aHeader"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                validate_redirect_path(value)
        self.assertEqual(validate_redirect_path("/blog/new-article"), "/blog/new-article")

    def test_chains_resolve_in_one_hop(self):
        self.mock_routes({"/old": "/middle", "/middle": "/blog/new"})
        self.assertEqual(resolve_redirect("/old"), "/blog/new")
        self.assertIsNone(resolve_redirect("/unknown"))

    def test_legacy_cycles_and_external_targets_are_ignored(self):
        self.mock_routes({"/a": "/b", "/b": "/a", "/external": "//evil.example"})
        self.assertIsNone(resolve_redirect("/a"))
        self.assertIsNone(resolve_redirect("/external"))

    def test_public_endpoint_returns_only_resolved_target(self):
        self.mock_routes({"/old": "/blog/new"})
        request = APIRequestFactory().get("/api/blog/redirects/resolve/", {"path": "/old"})
        response = RedirectResolveView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"new_path": "/blog/new"})

    def test_legacy_trailing_slashes_work_with_next_normalized_paths(self):
        self.mock_routes({"/old/": "/blog/new/"})
        self.assertEqual(resolve_redirect("/old"), "/blog/new")
        self.assertIsNone(resolve_redirect("/unmapped/"))

    def test_crm_rejects_new_cycles(self):
        self.mock_routes({"/a": "/b"})
        serializer = SlugRedirectCrmSerializer()
        from rest_framework.exceptions import ValidationError as ApiValidationError
        with self.assertRaises(ApiValidationError):
            serializer.validate({"old_path": "/b", "new_path": "/a"})
