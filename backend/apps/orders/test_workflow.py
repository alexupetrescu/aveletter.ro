import threading
import uuid
from datetime import timedelta
from unittest.mock import patch

import pymupdf
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase, override_settings, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APIClient

from apps.payments.models import Payment
from apps.site_config.models import SiteConfig
from .invoicing import get_invoice_pdf, issue_invoice, preview_invoice
from .mail_worker import deliver_next
from .models import Address, Invoice, InvoiceSeries, NotificationConfig, Order, OrderEvent, OrderLine, OutgoingEmail, TaxConfig
from .notifications import get_template, queue_email, queue_order_placed
from .services import mark_order_paid
from .workflow import record_payment, update_order


def fixture():
    config = TaxConfig.get_solo()
    config.legal_name = "Atelier Test SRL"
    config.cui = "12345678"
    config.fiscal_address = "Strada Școlii, Râmnicu Vâlcea"
    config.save()
    series = InvoiceSeries.objects.create(code="TEST", next_number=167)
    address = Address.objects.create(full_name="Ștefania Țîrlea", phone="0700000000", city="București", line1="Strada Lalelelor 1")
    order = Order.objects.create(order_number="AVE-TEST-WORKFLOW", email="client@example.com", status="pending_payment",
                                 billing_address=address, shipping_address=address, subtotal_amount=195000,
                                 subtotal_net_amount=195000, shipping_amount=2500, total_amount=197500,
                                 placed_at=timezone.now())
    OrderLine.objects.create(order=order, product_title="Invitații personalizate", quantity=1, unit_price_amount=195000,
                             line_total_amount=195000, unit_net_amount=195000, line_net_amount=195000,
                             vat_legal_mention="Neplătitor de TVA")
    Payment.objects.create(order=order, provider="cash", status="pending", amount=197500)
    return order, series, config


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class WorkflowTests(TestCase):
    def setUp(self):
        self.order, self.series, self.config = fixture()
        self.staff = get_user_model().objects.create_user("atelier", is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.staff)
        self.root = f"/api/crm/orders/{self.order.order_number}"

    def test_placed_notifies_customer_and_configured_staff_once(self):
        config = NotificationConfig.get_solo()
        config.order_recipients = ["atelier@example.com", "manager@example.com"]
        config.save()
        queue_order_placed(self.order)
        queue_order_placed(self.order)
        self.assertEqual(self.order.emails.count(), 3)
        self.assertEqual(self.order.events.filter(key="placed").count(), 1)
        while deliver_next():
            pass
        self.assertEqual(len(mail.outbox), 3)
        self.assertIn("ramburs", mail.outbox[0].body)

    def test_disabled_template_and_per_transition_override(self):
        template = get_template("in_production")
        template.enabled = False
        template.save()
        self.order = update_order(self.order, data={"status": "in_production"}, actor=self.staff)
        self.assertEqual(self.order.emails.get().status, "skipped")
        self.order = update_order(self.order, data={"status": "ready_to_ship", "send_email": False})
        self.assertEqual(self.order.emails.filter(status="skipped").count(), 2)
        self.assertFalse(deliver_next())

    def test_cash_can_produce_without_claiming_payment(self):
        response = self.client.patch(f"{self.root}/", {"status": "in_production", "send_email": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.order.refresh_from_db()
        self.assertIsNone(self.order.paid_at)
        self.assertEqual(self.order.payments.get().status, "pending")
        self.assertEqual(self.order.emails.get().status, "pending")

    def test_cash_payment_state_is_consistent_on_public_pages_and_revenue(self):
        self.order = update_order(self.order, data={"status": "in_production", "send_email": False})
        response = self.client.get("/api/crm/stats/")
        self.assertEqual(response.data["revenue_total"], 0)
        public = self.client.get(f"/api/orders/{self.order.order_number}/")
        self.assertEqual(public.data["payment_method"], "cash")
        self.assertIsNone(public.data["paid_at"])
        record_payment(self.order, actor=self.staff, send=False)
        response = self.client.get("/api/crm/stats/")
        self.assertEqual(response.data["revenue_total"], self.order.total_amount)

    def test_cash_order_cannot_receive_online_payment_resume_link(self):
        self.client.force_authenticate(None)
        response = self.client.post("/api/checkout/resume/", {"order_number": self.order.order_number}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/checkout/cancelled/", {"order_number": self.order.order_number}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.order.emails.filter(template_key="payment_resume").exists())

    def test_repeated_status_patch_does_not_duplicate(self):
        for _ in range(2):
            response = self.client.patch(f"{self.root}/", {"status": "in_production", "expected_status": "pending_payment"}, format="json")
            self.assertEqual(response.status_code, 200)
        self.assertEqual(self.order.emails.count(), 1)
        self.assertEqual(self.order.events.count(), 1)
        response = self.client.patch(f"{self.root}/", {"status": "ready_to_ship", "expected_status": "pending_payment"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_shipping_requires_awb_even_when_email_skipped(self):
        self.order.status = "ready_to_ship"
        self.order.save()
        response = self.client.patch(f"{self.root}/", {"status": "shipped", "send_email": False}, format="json")
        self.assertEqual(response.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "ready_to_ship")
        self.assertFalse(self.order.events.exists())
        response = self.client.patch(f"{self.root}/", {"status": "shipped", "awb": "AWB123", "courier": "Curier test"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("AWB123", self.order.emails.get().body)
        self.order.refresh_from_db()
        self.assertIsNotNone(self.order.shipped_at)

    def test_shipping_correction_email_uses_new_saved_awb(self):
        self.order.status = "ready_to_ship"
        self.order.save()
        self.order = update_order(self.order, data={"status": "shipped", "awb": "OLD"})
        self.client.patch(f"{self.root}/", {"awb": "NEW"}, format="json")
        response = self.client.post(f"{self.root}/send-shipping-email/", {"request_id": str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("NEW", response.data["body"])
        self.assertIn("OLD", self.order.emails.get(template_key="shipped", event__isnull=False).body)

    def test_transaction_rollback_discards_event_and_email(self):
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                update_order(self.order, data={"status": "in_production"})
                raise RuntimeError("rollback")
        self.assertFalse(self.order.events.exists())
        self.assertFalse(self.order.emails.exists())

    def test_payment_recording_keeps_advanced_fulfillment_status(self):
        self.order = update_order(self.order, data={"status": "in_production", "send_email": False})
        self.order = record_payment(self.order, actor=self.staff)
        self.assertEqual(self.order.status, "in_production")
        self.assertIsNotNone(self.order.paid_at)
        self.assertEqual(self.order.payments.get().status, "succeeded")
        record_payment(self.order, actor=self.staff)
        self.assertEqual(self.order.emails.filter(template_key="paid").count(), 1)

    def test_cannot_fake_stripe_payment_or_refund_by_status_patch(self):
        self.order.payments.update(provider="stripe")
        response = self.client.patch(f"{self.root}/", {"status": "paid"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(f"{self.root}/record-payment/", {"confirmed": True}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_stripe_invoice_failure_does_not_undo_payment(self):
        self.config.cui = ""
        self.config.save()
        self.order.payments.update(provider="stripe", status="succeeded")
        with self.captureOnCommitCallbacks(execute=True):
            mark_order_paid(self.order)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "paid")
        self.assertIsNotNone(self.order.paid_at)
        self.assertIn("CIF", self.order.invoice_error)
        self.assertEqual(self.order.emails.filter(template_key="paid").count(), 1)

    def test_stripe_requires_confirmed_payment_and_replay_is_idempotent(self):
        from apps.payments.views import StripeWebhookView
        self.order.payments.update(provider="stripe", stripe_checkout_session_id="cs_workflow")
        event = {"id": "evt_unpaid", "type": "checkout.session.completed", "data": {"object": {
            "id": "cs_workflow", "payment_status": "unpaid", "payment_intent": "pi_workflow",
        }}}
        webhook = StripeWebhookView()
        webhook._handle_session_completed(event)
        self.order.refresh_from_db()
        self.assertIsNone(self.order.paid_at)
        self.assertFalse(self.order.invoices.exists())
        event["data"]["object"]["payment_status"] = "paid"
        event["id"] = "evt_paid"
        with self.captureOnCommitCallbacks(execute=True):
            webhook._handle_session_completed(event)
        event["id"] = "evt_paid_replay"
        with self.captureOnCommitCallbacks(execute=True):
            webhook._handle_session_completed(event)
        self.order.refresh_from_db()
        self.assertIsNotNone(self.order.paid_at)
        self.assertEqual(self.order.invoices.count(), 1)
        self.assertEqual(self.order.emails.filter(template_key="paid").count(), 1)

    def test_company_checkout_queues_received_email_and_freezes_billing(self):
        from apps.shop.models import Product
        from .models import Cart, CartItem
        product = Product.objects.create(title="Produs test", slug="produs-test", base_price_amount=1000,
                                         status="published", published_at=timezone.now())
        cart = Cart.objects.create(session_key="workflow-checkout")
        CartItem.objects.create(cart=cart, product=product)
        billing = {"full_name": "Maria Popescu", "phone": "0700000000", "city": "București",
                   "line1": "Strada Test 1", "is_company": True, "company_name": "Client SRL", "cui": "12345678"}
        self.client.force_authenticate(None)
        response = self.client.post("/api/checkout/start/", {"email": "client@example.com", "payment_method": "ramburs",
                                   "billing_address": billing}, format="json", HTTP_X_CART_KEY=cart.session_key)
        self.assertEqual(response.status_code, 200, response.data)
        order = Order.objects.get(order_number=response.data["order_number"])
        self.assertEqual(order.billing_address.company_name, "Client SRL")
        self.assertEqual(order.status, "pending_payment")
        self.assertEqual(order.emails.get(template_key="placed").status, "pending")
        self.assertFalse(order.invoices.exists())

    def test_refund_requires_explicit_confirmation_and_is_recorded_once(self):
        record_payment(self.order, actor=self.staff, send=False)
        response = self.client.post(f"{self.root}/record-refund/", {"confirmed": False}, format="json")
        self.assertEqual(response.status_code, 400)
        for _ in range(2):
            response = self.client.post(f"{self.root}/record-refund/", {"confirmed": True}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.order.payments.get().status, "refunded")
        self.assertEqual(self.order.emails.filter(template_key="refunded").count(), 1)

    def test_invoice_preview_issuance_and_frozen_pdf(self):
        pdf = preview_invoice(self.order)
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.series.refresh_from_db()
        self.assertEqual(self.series.next_number, 167)
        self.assertFalse(Invoice.objects.exists())
        invoice = issue_invoice(self.order)
        self.assertEqual(invoice.number, 167)
        self.assertEqual(invoice.pk, issue_invoice(self.order).pk)
        original = get_invoice_pdf(invoice)
        self.config.legal_name = "Changed seller"
        self.config.save()
        self.assertEqual(original, get_invoice_pdf(invoice))
        text = "".join(page.get_text() for page in pymupdf.open(stream=original, filetype="pdf"))
        self.assertIn("Ștefania Țîrlea", text)
        self.assertIn("Invitații personalizate", text)
        self.assertIn("Atelier Test SRL", text)
        self.assertIn("1975.00", text)
        self.assertEqual(invoice.gross_amount, invoice.net_amount + invoice.vat_amount)

    def test_invalid_invoice_configuration_does_not_consume_number(self):
        self.config.fiscal_address = ""
        self.config.save()
        response = self.client.post(f"{self.root}/issue-invoice/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.series.refresh_from_db()
        self.assertEqual(self.series.next_number, 167)
        self.assertFalse(Invoice.objects.exists())

    def test_pdf_multi_page_and_vat(self):
        from .invoice_pdf import render_invoice_pdf
        invoice = issue_invoice(self.order)
        snapshot = dict(invoice.snapshot)
        snapshot["vat_enabled"] = True
        snapshot["lines"] = snapshot["lines"] * 70
        document = pymupdf.open(stream=render_invoice_pdf(snapshot), filetype="pdf")
        self.assertGreater(len(document), 1)
        for page in document:
            self.assertIn("Pagina", page.get_text())
        self.assertIn("TVA", document[0].get_text())

    def test_invoice_send_attaches_issued_pdf_and_request_is_idempotent(self):
        invoice = issue_invoice(self.order)
        key = str(uuid.uuid4())
        for _ in range(2):
            response = self.client.post(f"/api/crm/invoices/{invoice.pk}/send/", {"request_id": key}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(invoice.emails.count(), 1)
        deliver_next()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].attachments[0][1], get_invoice_pdf(invoice))
        response = self.client.post(f"/api/crm/invoices/{invoice.pk}/send/", {"request_id": key}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(invoice.emails.count(), 1)

    def test_delivery_failure_is_retryable_and_never_marked_sent(self):
        message = queue_email("placed", order=self.order, recipient=self.order.email, idempotency_key="test:failure")
        with patch("django.core.mail.EmailMultiAlternatives.send", side_effect=RuntimeError("SMTP unavailable")):
            deliver_next()
        message.refresh_from_db()
        self.assertEqual(message.status, "failed")
        self.assertIsNone(message.sent_at)
        self.assertFalse(deliver_next())
        response = self.client.post(f"/api/crm/email-log/{message.pk}/retry/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        deliver_next()
        message.refresh_from_db()
        self.assertEqual(message.status, "sent")
        self.assertEqual(message.attempts, 2)

    def test_abandoned_claim_is_not_automatically_resent(self):
        message = queue_email("placed", order=self.order, recipient=self.order.email, idempotency_key="test:stale")
        message.status = "sending"
        message.claimed_at = timezone.now() - timedelta(minutes=11)
        message.save()
        self.assertFalse(deliver_next())
        message.refresh_from_db()
        self.assertEqual(message.status, "uncertain")

    def test_template_placeholders_validated_and_content_escaped(self):
        template = get_template("placed")
        url = f"/api/crm/email-templates/{template.pk}/"
        response = self.client.patch(url, {"body": "{{unknown}}"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(url + "preview/", {"body": "<script>alert(1)</script> {{customer_name}}"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("<script>", response.data["html"])
        self.assertIn("Maria Popescu", response.data["body"])

    def test_company_billing_changes_before_issue_keep_shipping_intact(self):
        shipping_id = self.order.shipping_address_id
        response = self.client.patch(f"{self.root}/billing-address/", {"is_company": True, "company_name": "Client SRL", "cui": "1234567"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.shipping_address_id, shipping_id)
        self.assertNotEqual(self.order.billing_address_id, shipping_id)
        invoice = issue_invoice(self.order)
        self.assertEqual(invoice.snapshot["buyer"]["company_name"], "Client SRL")
        response = self.client.patch(f"{self.root}/billing-address/", {"company_name": "Changed"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_series_cannot_be_renumbered_after_issuance(self):
        issue_invoice(self.order)
        response = self.client.patch(f"/api/crm/invoice-series/{self.series.pk}/", {"next_number": 1}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_private_settings_and_documents_require_staff(self):
        invoice = issue_invoice(self.order)
        self.client.force_authenticate(None)
        for url in ("/api/crm/notification-config/", "/api/crm/email-templates/", "/api/crm/email-log/",
                    f"/api/crm/invoices/{invoice.pk}/pdf/", f"{self.root}/invoice-preview/"):
            self.assertEqual(self.client.get(url).status_code, 403, url)
        public = self.client.get("/api/site-config/")
        if public.status_code == 200:
            self.assertNotIn("order_recipients", public.data)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class ConcurrentInvoiceTests(TransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_issuance_returns_one_original_invoice(self):
        order, series, _ = fixture()
        SiteConfig.get_solo()
        errors, ids = [], []
        barrier = threading.Barrier(4)
        def worker():
            try:
                barrier.wait(timeout=10)
                ids.append(issue_invoice(Order.objects.get(pk=order.pk)).pk)
            except Exception as exc:
                errors.append(exc)
            finally:
                connection.close()
        workers = [threading.Thread(target=worker) for _ in range(4)]
        for worker_thread in workers:
            worker_thread.start()
        for worker_thread in workers:
            worker_thread.join(timeout=20)
        self.assertFalse(any(thread.is_alive() for thread in workers))
        self.assertEqual(errors, [])
        self.assertEqual(len(set(ids)), 1)
        self.assertEqual(Invoice.objects.count(), 1)
        series.refresh_from_db()
        self.assertEqual(series.next_number, 168)
