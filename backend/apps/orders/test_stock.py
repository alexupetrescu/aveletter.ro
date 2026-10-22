import threading
from unittest.mock import patch

import stripe

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from apps.shop.models import Product, ProductOption, ProductOptionGroup, ProductVariant
from .models import Address, Cart, CartItem, Order
from .services import CheckoutError, create_order_from_cart
from .tests import make_tax_config
from .workflow import update_order


ADDRESS = {"full_name": "Client test", "phone": "0700000000", "city": "București", "line1": "Strada Test 1"}


def product(**kwargs):
    return Product.objects.create(
        title="Produs test", slug=kwargs.pop("slug", "stock-test"),
        status=Product.Status.PUBLISHED, base_price_amount=5000, **kwargs,
    )


def checkout(cart):
    return create_order_from_cart(cart, email="client@example.com", billing_address_data=ADDRESS)


class CartStockTests(TestCase):
    def setUp(self):
        self.product = product(stock_quantity=3)
        self.client = APIClient()
        self.client.credentials(HTTP_X_CART_KEY="stock-cart")

    def add(self, **kwargs):
        return self.client.post("/api/cart/items/", {"product_slug": self.product.slug, **kwargs}, format="json")

    def test_any_product_type_can_have_stock(self):
        for product_type, _ in Product.ProductType.choices:
            self.product.product_type = product_type
            self.product.stock_quantity = 0
            self.product.save()
            self.assertEqual(self.add().status_code, 400, product_type)
        self.assertFalse(CartItem.objects.exists())

    def test_unlimited_made_to_order_product(self):
        self.product.stock_quantity = None
        self.product.save()
        self.assertEqual(self.add(quantity=100).status_code, 200)

    def test_duplicate_lines_share_product_stock(self):
        self.assertEqual(self.add(quantity=2).status_code, 200)
        self.assertEqual(self.add(quantity=2).status_code, 400)
        self.assertEqual(self.add(quantity=1).status_code, 200)

    def test_invalid_quantities_are_rejected(self):
        for quantity in (-1, 0, 1.5, "invalid", None, True):
            self.assertEqual(self.add(quantity=quantity).status_code, 400, quantity)

    def test_variant_stock_and_missing_variant(self):
        variant = ProductVariant.objects.create(product=self.product, name="Mic", track_stock=True, stock_quantity=1)
        self.assertEqual(self.add().status_code, 400)
        self.assertEqual(self.add(variant_id=variant.pk, quantity=2).status_code, 400)
        self.assertEqual(self.add(variant_id=variant.pk).status_code, 200)
        self.assertEqual(self.add(variant_id=variant.pk).status_code, 400)

    def test_cart_patch_does_not_exceed_combined_stock(self):
        response = self.add(quantity=2)
        item_id = response.data["items"][0]["id"]
        self.add(quantity=1)
        response = self.client.patch(f"/api/cart/items/{item_id}/", {"quantity": 3}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(CartItem.objects.get(pk=item_id).quantity, 2)

    def test_failed_patch_does_not_change_selected_options(self):
        group = ProductOptionGroup.objects.create(product=self.product, name="Culoare", slug="culoare")
        original = ProductOption.objects.create(group=group, label="Roșu", value="rosu")
        other = ProductOption.objects.create(group=group, label="Alb", value="alb")
        response = self.add(options=[original.pk])
        item = CartItem.objects.get(pk=response.data["items"][0]["id"])
        response = self.client.patch(f"/api/cart/items/{item.pk}/", {"quantity": 4, "options": [other.pk]}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(list(item.selected_options.all()), [original])

    def test_existing_cart_reports_new_stock_shortage(self):
        self.add(quantity=2)
        self.product.stock_quantity = 0
        self.product.save()
        response = self.client.get("/api/cart/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Stoc insuficient", response.data["items"][0]["stock_error"])


class CheckoutStockTests(TestCase):
    def setUp(self):
        make_tax_config()
        self.product = product(stock_quantity=3)
        self.cart = Cart.objects.create(session_key="checkout-stock")

    def item(self, quantity=1, **kwargs):
        return CartItem.objects.create(cart=self.cart, product=self.product, quantity=quantity, **kwargs)

    def test_reserves_product_and_variant_stock_and_consumes_cart(self):
        variant = ProductVariant.objects.create(product=self.product, name="Mic", track_stock=True, stock_quantity=5)
        self.item(quantity=2, variant=variant)
        order = checkout(self.cart)
        self.product.refresh_from_db()
        variant.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 1)
        self.assertEqual(variant.stock_quantity, 3)
        self.assertEqual(order.lines.get().reserved_product_quantity, 2)
        self.assertEqual(order.lines.get().reserved_variant_quantity, 2)
        self.assertFalse(self.cart.items.exists())

    def test_duplicate_lines_cannot_exceed_stock(self):
        self.item(quantity=2)
        self.item(quantity=2)
        with self.assertRaises(CheckoutError):
            checkout(self.cart)
        self.assertFalse(Order.objects.exists())
        self.assertFalse(Address.objects.exists())
        self.assertEqual(self.cart.items.count(), 2)

    def test_multiple_lines_deduct_shared_stock_once_per_unit(self):
        self.item(quantity=1)
        self.item(quantity=2)
        checkout(self.cart)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 0)

    def test_stale_cart_zero_stock_is_rejected_by_checkout_api(self):
        self.item()
        self.product.stock_quantity = 0
        self.product.save()
        client = APIClient()
        client.credentials(HTTP_X_CART_KEY=self.cart.session_key)
        response = client.post("/api/checkout/start/", {
            "email": "client@example.com", "billing_address": ADDRESS,
            "payment_method": "ramburs",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Stoc insuficient", " ".join(response.data["errors"]))
        self.assertFalse(Order.objects.exists())
        self.assertEqual(self.cart.items.count(), 1)

    @patch("apps.payments.views.create_checkout_session", side_effect=stripe.error.APIConnectionError("Test failure"))
    def test_stripe_setup_failure_keeps_cart_and_stock(self, _mock):
        self.item(quantity=2)
        client = APIClient()
        client.credentials(HTTP_X_CART_KEY=self.cart.session_key)
        response = client.post("/api/checkout/start/", {
            "email": "client@example.com", "billing_address": ADDRESS,
            "payment_method": "stripe",
        }, format="json")
        self.assertEqual(response.status_code, 502, response.data)
        self.assertFalse(Order.objects.exists())
        self.assertEqual(self.cart.items.count(), 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

    def test_archived_product_cannot_be_checked_out_from_old_cart(self):
        self.item()
        self.product.status = "archived"
        self.product.save()
        with self.assertRaises(CheckoutError):
            checkout(self.cart)

    def test_inactive_variant_cannot_be_checked_out(self):
        variant = ProductVariant.objects.create(product=self.product, name="Mic", is_active=False)
        self.item(variant=variant)
        with self.assertRaises(CheckoutError):
            checkout(self.cart)

    def test_invalid_quote_rolls_back_stock_and_keeps_cart(self):
        self.item()
        invalid = product(slug="invalid-quote")
        group = ProductOptionGroup.objects.create(product=invalid, name="Obligatoriu", slug="required", required=True)
        ProductOption.objects.create(group=group, label="A", value="a")
        CartItem.objects.create(cart=self.cart, product=invalid)
        with self.assertRaises(CheckoutError):
            checkout(self.cart)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)
        self.assertEqual(self.cart.items.count(), 2)
        self.assertFalse(Order.objects.exists())

    def test_cancel_restores_reserved_stock_once(self):
        variant = ProductVariant.objects.create(product=self.product, name="Mic", track_stock=True, stock_quantity=5)
        self.item(quantity=2, variant=variant)
        order = checkout(self.cart)
        order = update_order(order, data={"status": "cancelled", "send_email": False})
        update_order(order, data={"status": "cancelled", "send_email": False})
        self.product.refresh_from_db()
        variant.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)
        self.assertEqual(variant.stock_quantity, 5)
        self.assertEqual(order.lines.get().reserved_product_quantity, 0)

    def test_cancelling_legacy_order_does_not_inflate_stock(self):
        from .models import OrderLine
        order = Order.objects.create(status="pending_payment", email="client@example.com")
        OrderLine.objects.create(order=order, product=self.product, product_title="Legacy", quantity=2,
                                 unit_price_amount=5000, line_total_amount=10000)
        update_order(order, data={"status": "cancelled", "send_email": False})
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

    def test_made_to_order_does_not_deduct_or_restore_product_stock(self):
        self.product.stock_quantity = None
        self.product.save()
        self.item(quantity=30)
        order = checkout(self.cart)
        update_order(order, data={"status": "cancelled", "send_email": False})
        self.product.refresh_from_db()
        self.assertIsNone(self.product.stock_quantity)


class ProductManagementStockTests(TestCase):
    def setUp(self):
        self.product = product(stock_quantity=3)
        staff = get_user_model().objects.create_user(username="stock-staff", is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(staff)
        self.url = f"/api/crm/products/{self.product.pk}/"

    def test_edit_stock_for_every_product_type(self):
        for product_type, _ in Product.ProductType.choices:
            response = self.client.patch(self.url, {"product_type": product_type, "stock_quantity": 7}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["stock_quantity"], 7)

    def test_clear_stock_enables_made_to_order(self):
        response = self.client.patch(self.url, {"stock_quantity": None}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["stock_quantity"])

    def test_negative_and_fractional_stock_rejected(self):
        for quantity in (-1, 1.5):
            response = self.client.patch(self.url, {"stock_quantity": quantity}, format="json")
            self.assertEqual(response.status_code, 400)

    def test_stock_edit_rejects_stale_value_after_sale(self):
        Product.objects.filter(pk=self.product.pk).update(stock_quantity=2)
        response = self.client.patch(self.url, {
            "stock_quantity": 10, "expected_stock_quantity": 3,
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 2)

    def test_metadata_patch_does_not_change_stock(self):
        response = self.client.patch(self.url, {"title": "Titlu actualizat"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["stock_quantity"], 3)

    def test_price_visibility_is_independent_of_publication(self):
        response = self.client.patch(self.url, {"show_price": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["show_price"])
        self.assertEqual(response.data["status"], "published")
        public = APIClient()
        detail = public.get(f"/api/shop/products/{self.product.slug}/")
        self.assertEqual(detail.status_code, 200)
        self.assertFalse(detail.data["show_price"])
        listing = public.get("/api/shop/products/")
        self.assertFalse(listing.data["results"][0]["show_price"])
        response = self.client.patch(self.url, {"show_price": True}, format="json")
        self.assertTrue(response.data["show_price"])

    def test_hiding_price_does_not_change_checkout_totals(self):
        self.product.show_price = False
        self.product.save()
        cart = Cart.objects.create(session_key="hidden-price-cart")
        CartItem.objects.create(cart=cart, product=self.product, quantity=2)
        order = checkout(cart)
        self.assertEqual(order.subtotal_amount, 10000)
        self.assertEqual(order.lines.get().unit_price_amount, 5000)


class ConcurrentStockTests(TransactionTestCase):
    def setUp(self):
        make_tax_config()

    def race(self, carts):
        barrier = threading.Barrier(2)
        results, errors = [], []

        def worker(cart_id):
            try:
                cart = Cart.objects.get(pk=cart_id)
                barrier.wait(timeout=10)
                try:
                    checkout(cart)
                    results.append("ordered")
                except CheckoutError:
                    results.append("rejected")
            except Exception as exc:
                errors.append(repr(exc))
            finally:
                connection.close()

        threads = [threading.Thread(target=worker, args=(cart.pk,)) for cart in carts]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        self.assertCountEqual(results, ["ordered", "rejected"])
        self.assertEqual(Order.objects.count(), 1)

    def test_two_carts_compete_for_last_product(self):
        p = product(stock_quantity=1)
        carts = [Cart.objects.create(session_key=f"race-{i}") for i in range(2)]
        for cart in carts:
            CartItem.objects.create(cart=cart, product=p)
        self.race(carts)
        p.refresh_from_db()
        self.assertEqual(p.stock_quantity, 0)

    def test_two_carts_compete_for_last_variant(self):
        p = product()
        variant = ProductVariant.objects.create(product=p, name="Mic", track_stock=True, stock_quantity=1)
        carts = [Cart.objects.create(session_key=f"variant-race-{i}") for i in range(2)]
        for cart in carts:
            CartItem.objects.create(cart=cart, product=p, variant=variant)
        self.race(carts)
        variant.refresh_from_db()
        self.assertEqual(variant.stock_quantity, 0)

    def test_same_cart_cannot_be_checked_out_twice(self):
        p = product(stock_quantity=3)
        cart = Cart.objects.create(session_key="same-cart-race")
        CartItem.objects.create(cart=cart, product=p)
        self.race([cart, cart])
        p.refresh_from_db()
        self.assertEqual(p.stock_quantity, 2)
