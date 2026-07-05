from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.richtext import extract_text

User = get_user_model()

TIPTAP_DOC = {
    "type": "doc",
    "content": [
        {"type": "heading", "attrs": {"level": 2},
         "content": [{"type": "text", "text": "Titlu de secțiune"}]},
        {"type": "paragraph",
         "content": [
             {"type": "text", "text": "Un paragraf cu "},
             {"type": "text", "marks": [{"type": "bold"}], "text": "accent"},
             {"type": "text", "text": " și diacritice: șură, țață."},
         ]},
        {"type": "blockquote", "content": [
            {"type": "paragraph",
             "content": [{"type": "text", "text": "Un citat frumos."}]},
        ]},
        {"type": "bulletList", "content": [
            {"type": "listItem", "content": [
                {"type": "paragraph",
                 "content": [{"type": "text", "text": "primul punct"}]},
            ]},
            {"type": "listItem", "content": [
                {"type": "paragraph",
                 "content": [{"type": "text", "text": "al doilea punct"}]},
            ]},
        ]},
    ],
}


class ExtractTextTests(TestCase):
    def test_empty_and_invalid(self):
        self.assertEqual(extract_text(None), "")
        self.assertEqual(extract_text({}), "")
        self.assertEqual(extract_text("plain"), "")
        self.assertEqual(extract_text([]), "")

    def test_full_document(self):
        text = extract_text(TIPTAP_DOC)
        self.assertIn("Titlu de secțiune", text)
        self.assertIn("Un paragraf cu accent și diacritice: șură, țață.", text)
        self.assertIn("Un citat frumos.", text)
        self.assertIn("primul punct", text)
        self.assertIn("al doilea punct", text)
        # Blocks separated so word counting behaves like prose.
        self.assertIn("\n\n", text)

    def test_inline_marks_do_not_split_words(self):
        doc = {
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "cuv"},
                    {"type": "text", "marks": [{"type": "italic"}], "text": "ânt"},
                ],
            }],
        }
        self.assertEqual(extract_text(doc), "cuvânt")


class CrmAuthGatingTests(TestCase):
    PROTECTED = [
        "/api/crm/products/",
        "/api/crm/orders/",
        "/api/crm/posts/",
        "/api/crm/media/",
        "/api/crm/invoices/",
        "/api/crm/vat-rates/",
        "/api/crm/stats/",
        "/api/crm/site-config/",
    ]

    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            "staff", password="pw", is_staff=True,
        )
        self.customer = User.objects.create_user("customer", password="pw")

    def test_anonymous_rejected(self):
        for url in self.PROTECTED:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 403, url)

    def test_non_staff_rejected(self):
        self.client.force_authenticate(self.customer)
        for url in self.PROTECTED:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 403, url)

    def test_staff_allowed(self):
        self.client.force_authenticate(self.staff)
        for url in self.PROTECTED:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)

    def test_login_rejects_non_staff(self):
        response = self.client.post(
            "/api/crm/auth/login/",
            {"username": "customer", "password": "pw"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_login_logout_me_flow(self):
        response = self.client.post(
            "/api/crm/auth/login/",
            {"username": "staff", "password": "pw"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["username"], "staff")
        self.assertTrue(response.data["csrfToken"])

        me = self.client.get("/api/crm/auth/me/")
        self.assertEqual(me.data["user"]["username"], "staff")

        self.client.post("/api/crm/auth/logout/")
        me_after = self.client.get("/api/crm/auth/me/")
        self.assertIsNone(me_after.data["user"])


class MediaUploadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user("staff", password="pw", is_staff=True)
        self.client.force_authenticate(self.staff)

    def test_upload_image_without_kind(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        png = SimpleUploadedFile(
            "photo.png",
            b"\x89PNG\r\n\x1a\n",
            content_type="image/png",
        )
        response = self.client.post(
            "/api/crm/media/",
            {"file": png},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["kind"], "image")
        self.assertEqual(response.data["original_filename"], "photo.png")
        self.assertEqual(response.data["mime_type"], "image/png")


class RichTextSyncTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user("staff", password="pw", is_staff=True)
        self.client.force_authenticate(self.staff)

    def test_post_body_text_synced(self):
        response = self.client.post(
            "/api/crm/posts/",
            {
                "title": "Articol test",
                "slug": "articol-test",
                "status": "draft",
                "body": TIPTAP_DOC,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn("Titlu de secțiune", response.data["body_text"])
        self.assertGreaterEqual(response.data["reading_time"], 1)

    def test_product_description_text_synced(self):
        response = self.client.post(
            "/api/crm/products/",
            {
                "title": "Produs test",
                "slug": "produs-test",
                "status": "draft",
                "product_type": "standard",
                "base_price_amount": 5000,
                "description": TIPTAP_DOC,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn("Un citat frumos.", response.data["description_text"])

    def test_order_update_restricted_to_status_and_notes(self):
        from apps.orders.models import Order

        order = Order.objects.create(
            order_number="AVE-TEST-0001", email="x@y.z",
            status=Order.Status.PAID, total_amount=1000,
        )
        bad = self.client.patch(
            f"/api/crm/orders/{order.order_number}/",
            {"total_amount": 1},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)

        good = self.client.patch(
            f"/api/crm/orders/{order.order_number}/",
            {"status": "in_production", "internal_notes": "început lucrul"},
            format="json",
        )
        self.assertEqual(good.status_code, 200, good.data)
        order.refresh_from_db()
        self.assertEqual(order.status, "in_production")
        self.assertEqual(order.total_amount, 1000)
