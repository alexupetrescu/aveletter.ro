from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import (
    Product,
    ProductCategory,
    ProductCategoryAssignment,
    ProductInputField,
    ProductOption,
    ProductOptionGroup,
    ProductRecommendation,
    ProductVariant,
    TextByPagePricing,
)
from .pricing import count_words, quote_product
from .recommendations import (
    auto_cross_sell_candidates,
    auto_upsell_candidates,
    resolve_recommendations,
)


def make_product(**kwargs):
    category = kwargs.pop("category", None)
    category_ids = kwargs.pop("category_ids", None)
    primary_category_id = kwargs.pop("primary_category_id", None)
    defaults = {
        "title": "Test",
        "slug": kwargs.pop("slug", "test-product"),
        "status": Product.Status.PUBLISHED,
        "published_at": timezone.now(),
        "base_price_amount": 5000,
    }
    defaults.update(kwargs)
    product = Product.objects.create(**defaults)
    if category_ids is not None:
        product.set_categories(category_ids, primary_category_id)
    elif category is not None:
        product.set_categories([category.pk], category.pk)
    return product


class CountWordsTests(TestCase):
    def test_empty(self):
        self.assertEqual(count_words(""), 0)
        self.assertEqual(count_words(None), 0)

    def test_romanian_diacritics(self):
        self.assertEqual(count_words("Jurămintele și țelurile înălțătoare"), 4)

    def test_hyphenated_and_apostrophes(self):
        self.assertEqual(count_words("într-o zi c'est la vie"), 5)


class QuoteProductTests(TestCase):
    def test_base_price_only(self):
        product = make_product()
        quote = quote_product(product)
        self.assertEqual(quote.unit_price_amount, 5000)

    def test_variant_override(self):
        product = make_product()
        variant = ProductVariant.objects.create(
            product=product, name="Mare", price_override_amount=9000,
        )
        quote = quote_product(product, variant=variant)
        self.assertEqual(quote.unit_price_amount, 9000)

    def test_option_deltas_and_zero_clamp(self):
        product = make_product()
        group = ProductOptionGroup.objects.create(
            product=product, name="Extra", slug="extra", max_selections=2,
        )
        discount = ProductOption.objects.create(
            group=group, label="Discount absurd", value="disc",
            price_delta_amount=-99999,
        )
        quote = quote_product(product, selected_options=[discount])
        self.assertEqual(quote.unit_price_amount, 0)
        self.assertTrue(quote.warnings)

    def test_foreign_option_rejected(self):
        product = make_product()
        other = make_product(slug="other-product")
        group = ProductOptionGroup.objects.create(
            product=other, name="Culoare", slug="culoare",
        )
        foreign = ProductOption.objects.create(
            group=group, label="Auriu", value="auriu",
        )
        with self.assertRaises(ValidationError):
            quote_product(product, selected_options=[foreign])

    def test_required_group_enforced(self):
        product = make_product()
        group = ProductOptionGroup.objects.create(
            product=product, name="Culoare", slug="culoare",
            required=True, min_selections=1, max_selections=1,
        )
        ProductOption.objects.create(group=group, label="Auriu", value="auriu")
        with self.assertRaises(ValidationError):
            quote_product(product)

    def test_max_selections_enforced(self):
        product = make_product()
        group = ProductOptionGroup.objects.create(
            product=product, name="Extra", slug="extra", max_selections=1,
        )
        a = ProductOption.objects.create(group=group, label="A", value="a")
        b = ProductOption.objects.create(group=group, label="B", value="b")
        with self.assertRaises(ValidationError):
            quote_product(product, selected_options=[a, b])

    def test_required_input_enforced(self):
        product = make_product()
        ProductInputField.objects.create(
            product=product, key="words", label="Cuvinte",
            field_type=ProductInputField.FieldType.SHORT_TEXT, required=True,
        )
        with self.assertRaises(ValidationError):
            quote_product(product, inputs={})

    def test_text_by_page_rejects_blank_text_even_if_not_flagged_required(self):
        product = make_product(
            product_type=Product.ProductType.TEXT_BY_PAGE,
            base_price_amount=0,
        )
        ProductInputField.objects.create(
            product=product, key="message_text", label="Text",
            field_type=ProductInputField.FieldType.LONG_TEXT, required=False,
        )
        TextByPagePricing.objects.create(
            product=product,
            text_field_key="message_text",
            words_per_page=100,
            price_per_unit_amount=7000,
            setup_fee_amount=3000,
            minimum_pages=1,
        )
        with self.assertRaises(ValidationError):
            quote_product(product, inputs={"message_text": "   "})

    def test_preview_quote_allows_blank_text_and_returns_base_price(self):
        product = make_product(
            product_type=Product.ProductType.TEXT_BY_PAGE,
            base_price_amount=21000,
        )
        ProductInputField.objects.create(
            product=product, key="message_text", label="Textul dorit",
            field_type=ProductInputField.FieldType.LONG_TEXT, required=False,
        )
        TextByPagePricing.objects.create(
            product=product,
            text_field_key="message_text",
            pricing_mode=TextByPagePricing.PricingMode.PER_WORD_BLOCK,
            words_per_page=100,
            price_per_unit_amount=3500,
            setup_fee_amount=0,
        )
        quote = quote_product(product, inputs={"message_text": ""}, preview=True)
        self.assertEqual(quote.unit_price_amount, 21000)

    def test_max_words_enforced(self):
        product = make_product()
        ProductInputField.objects.create(
            product=product, key="words", label="Cuvinte",
            field_type=ProductInputField.FieldType.SHORT_TEXT, max_words=2,
        )
        with self.assertRaises(ValidationError):
            quote_product(product, inputs={"words": "unu doi trei"})


class TextByPageTests(TestCase):
    def setUp(self):
        self.product = make_product(
            product_type=Product.ProductType.TEXT_BY_PAGE,
            base_price_amount=0,
        )
        ProductInputField.objects.create(
            product=self.product, key="message_text", label="Text",
            field_type=ProductInputField.FieldType.LONG_TEXT, required=True,
        )
        TextByPagePricing.objects.create(
            product=self.product,
            text_field_key="message_text",
            words_per_page=100,
            price_per_unit_amount=7000,
            setup_fee_amount=3000,
            minimum_pages=1,
        )

    def quote_words(self, n):
        text = " ".join(["cuvânt"] * n)
        return quote_product(self.product, inputs={"message_text": text})

    def test_page_math_example_from_spec(self):
        # ceil(247/100) = 3 pages; prima pagină în preț bază, extra 2 × 70 + setup 30 = 170 RON
        quote = self.quote_words(247)
        self.assertEqual(quote.breakdown["pages"], 3)
        self.assertEqual(quote.breakdown["extra_pages"], 2)
        self.assertEqual(quote.unit_price_amount, 17000)

    def test_minimum_pages(self):
        quote = self.quote_words(1)
        self.assertEqual(quote.breakdown["pages"], 1)
        self.assertEqual(quote.breakdown["extra_pages"], 0)
        self.assertEqual(quote.unit_price_amount, 3000)

    def test_exact_page_boundary(self):
        quote = self.quote_words(200)
        self.assertEqual(quote.breakdown["pages"], 2)

    def test_maximum_pages_cap(self):
        self.product.text_pricing.maximum_pages = 2
        self.product.text_pricing.save()
        self.product.refresh_from_db()
        quote = self.quote_words(1000)
        self.assertEqual(quote.breakdown["pages"], 2)

    def test_text_field_key_validation(self):
        pricing = self.product.text_pricing
        pricing.text_field_key = "nonexistent"
        with self.assertRaises(ValidationError):
            pricing.full_clean()


class TextPerWordBlockTests(TestCase):
    def setUp(self):
        self.product = make_product(
            product_type=Product.ProductType.TEXT_BY_PAGE,
            base_price_amount=3500,
        )
        ProductInputField.objects.create(
            product=self.product, key="message_text", label="Text",
            field_type=ProductInputField.FieldType.LONG_TEXT, required=True,
        )
        TextByPagePricing.objects.create(
            product=self.product,
            text_field_key="message_text",
            pricing_mode=TextByPagePricing.PricingMode.PER_WORD_BLOCK,
            words_per_page=100,
            average_words_per_page=140,
            price_per_unit_amount=3500,
            setup_fee_amount=0,
        )

    def quote_words(self, n):
        text = " ".join(["cuvânt"] * n)
        return quote_product(self.product, inputs={"message_text": text})

    def test_first_block_uses_base_price_as_setup(self):
        quote = self.quote_words(100)
        self.assertEqual(quote.unit_price_amount, 3500)
        self.assertEqual(quote.breakdown["blocks"], 1)
        self.assertEqual(quote.breakdown["extra_blocks"], 0)

    def test_words_up_to_average_threshold_use_base_only(self):
        quote = self.quote_words(140)
        self.assertEqual(quote.unit_price_amount, 3500)
        self.assertEqual(quote.breakdown["extra_blocks"], 0)

    def test_extra_blocks_start_after_average_threshold(self):
        quote = self.quote_words(141)
        self.assertEqual(quote.breakdown["extra_blocks"], 1)
        self.assertEqual(quote.unit_price_amount, 3500 + 3500)

    def test_extra_blocks_charged(self):
        quote = self.quote_words(250)
        self.assertEqual(quote.breakdown["blocks"], 3)
        self.assertEqual(quote.breakdown["extra_blocks"], 2)
        self.assertEqual(quote.unit_price_amount, 3500 + 2 * 3500)

    def test_estimated_pages_use_average_words_per_page(self):
        quote = self.quote_words(281)
        self.assertEqual(quote.breakdown["blocks"], 3)
        self.assertEqual(quote.breakdown["estimated_pages"], 3)
        quote = self.quote_words(140)
        self.assertEqual(quote.breakdown["estimated_pages"], 1)


class TextPerWordSetupFallbackTests(TestCase):
    def setUp(self):
        self.product = make_product(
            product_type=Product.ProductType.TEXT_BY_PAGE,
            base_price_amount=5000,
        )
        ProductInputField.objects.create(
            product=self.product, key="message_text", label="Text",
            field_type=ProductInputField.FieldType.LONG_TEXT, required=True,
        )
        TextByPagePricing.objects.create(
            product=self.product,
            text_field_key="message_text",
            pricing_mode=TextByPagePricing.PricingMode.PER_WORD,
            words_per_page=100,
            price_per_unit_amount=1000,
            setup_fee_amount=0,
        )

    def test_setup_fee_defaults_to_base_price(self):
        quote = quote_product(
            self.product,
            inputs={"message_text": "unu doi trei"},
        )
        self.assertEqual(quote.unit_price_amount, 5000 + 3 * 1000)


class ProductQuoteApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.product = make_product(slug="quote-api-product")
        User = get_user_model()
        self.staff = User.objects.create_user("staff", password="pw", is_staff=True)

    def test_quote_works_without_csrf_for_anonymous(self):
        response = self.client.post(
            f"/api/shop/products/{self.product.slug}/quote/",
            {"inputs": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unit_price_amount"], 5000)

    def test_quote_works_when_staff_session_has_no_csrf(self):
        """Staff browsing the shop while logged into CRM must not break pricing."""
        self.client.login(username="staff", password="pw")
        response = self.client.post(
            f"/api/shop/products/{self.product.slug}/quote/",
            {"inputs": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unit_price_amount"], 5000)

    def test_quote_preview_allows_blank_text_for_text_by_page(self):
        product = make_product(
            slug="letter-preview",
            product_type=Product.ProductType.TEXT_BY_PAGE,
            base_price_amount=21000,
        )
        ProductInputField.objects.create(
            product=product, key="message_text", label="Textul dorit",
            field_type=ProductInputField.FieldType.LONG_TEXT, required=False,
        )
        TextByPagePricing.objects.create(
            product=product,
            text_field_key="message_text",
            pricing_mode=TextByPagePricing.PricingMode.PER_WORD_BLOCK,
            words_per_page=100,
            average_words_per_page=140,
            price_per_unit_amount=3500,
            setup_fee_amount=0,
        )
        response = self.client.post(
            f"/api/shop/products/{product.slug}/quote/",
            {"inputs": {"message_text": ""}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unit_price_amount"], 21000)


class RecommendationTests(TestCase):
    def setUp(self):
        self.category = ProductCategory.objects.create(name="Scrisori", slug="scrisori")
        self.product = make_product(
            slug="base-product",
            category=self.category,
            base_price_amount=5000,
        )
        self.premium = make_product(
            slug="premium-product",
            title="Premium",
            category=self.category,
            base_price_amount=12000,
        )
        self.complement = make_product(
            slug="complement-product",
            title="Complement",
            category=self.category,
            base_price_amount=3000,
        )

    def test_auto_upsell_prefers_higher_priced_same_category(self):
        upsells = auto_upsell_candidates(self.product)
        self.assertEqual(len(upsells), 1)
        self.assertEqual(upsells[0].pk, self.premium.pk)

    def test_auto_cross_sell_same_category(self):
        cross = auto_cross_sell_candidates(self.product)
        slugs = {p.slug for p in cross}
        self.assertIn("complement-product", slugs)
        self.assertNotIn("base-product", slugs)

    def test_manual_recommendations_take_priority(self):
        ProductRecommendation.objects.create(
            source=self.product,
            target=self.complement,
            kind=ProductRecommendation.Kind.UPSELL,
            sort_order=0,
        )
        upsells = resolve_recommendations(
            self.product, ProductRecommendation.Kind.UPSELL, limit=2,
        )
        self.assertEqual(upsells[0].pk, self.complement.pk)
        self.assertEqual(len(upsells), 2)
        self.assertEqual(upsells[1].pk, self.premium.pk)

    def test_product_detail_includes_recommendations(self):
        ProductRecommendation.objects.create(
            source=self.product,
            target=self.complement,
            kind=ProductRecommendation.Kind.CROSS_SELL,
        )
        client = APIClient()
        response = client.get(f"/api/shop/products/{self.product.slug}/")
        self.assertEqual(response.status_code, 200)
        slugs = [p["slug"] for p in response.data["cross_sells"]]
        self.assertEqual(slugs[0], "complement-product")
        self.assertIn("upsells", response.data)


class ProductCategoryTests(TestCase):
    def setUp(self):
        self.cat_a = ProductCategory.objects.create(name="Invitații", slug="invitatii")
        self.cat_b = ProductCategory.objects.create(name="Ornamente", slug="ornamente")
        self.product = make_product(
            slug="multi-cat",
            category_ids=[self.cat_a.pk, self.cat_b.pk],
            primary_category_id=self.cat_a.pk,
        )

    def test_primary_category_property(self):
        self.assertEqual(self.product.primary_category.pk, self.cat_a.pk)

    def test_list_filter_matches_any_category(self):
        client = APIClient()
        for slug in ("invitatii", "ornamente"):
            response = client.get("/api/shop/products/", {"category": slug})
            self.assertEqual(response.status_code, 200)
            slugs = [p["slug"] for p in response.data["results"]]
            self.assertIn("multi-cat", slugs)

    def test_detail_includes_categories(self):
        client = APIClient()
        response = client.get(f"/api/shop/products/{self.product.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["categories"]), 2)
        self.assertEqual(response.data["category"]["slug"], "invitatii")
        self.assertTrue(
            any(c["slug"] == "ornamente" for c in response.data["categories"]),
        )


class PremadeStockTests(TestCase):
    def test_public_availability_zero_stock(self):
        product = make_product(
            slug="premade-zero",
            product_type=Product.ProductType.PREMADE,
            stock_quantity=0,
            stock_status=Product.StockStatus.IN_STOCK,
        )
        avail = product.public_availability
        self.assertEqual(avail["label"], "La comandă")
        self.assertFalse(avail["show_quantity"])

    def test_public_availability_in_stock_hides_quantity(self):
        product = make_product(
            slug="premade-stock",
            product_type=Product.ProductType.PREMADE,
            stock_quantity=5,
            stock_status=Product.StockStatus.IN_STOCK,
        )
        avail = product.public_availability
        self.assertEqual(avail["label"], "În stoc")
        self.assertFalse(avail["show_quantity"])

    def test_public_availability_limited_shows_quantity(self):
        product = make_product(
            slug="premade-limited",
            product_type=Product.ProductType.PREMADE,
            stock_quantity=3,
            stock_status=Product.StockStatus.LIMITED,
        )
        avail = product.public_availability
        self.assertEqual(avail["label"], "Stoc limitat")
        self.assertTrue(avail["show_quantity"])
        self.assertEqual(avail["quantity"], 3)

    def test_product_detail_includes_availability(self):
        product = make_product(
            slug="premade-api",
            product_type=Product.ProductType.PREMADE,
            stock_quantity=2,
            stock_status=Product.StockStatus.LIMITED,
        )
        client = APIClient()
        response = client.get(f"/api/shop/products/{product.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["availability"]["label"], "Stoc limitat")
        self.assertTrue(response.data["availability"]["show_quantity"])
        self.assertEqual(response.data["availability"]["quantity"], 2)
