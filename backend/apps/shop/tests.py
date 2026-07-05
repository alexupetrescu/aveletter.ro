from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from .models import (
    Product,
    ProductInputField,
    ProductOption,
    ProductOptionGroup,
    ProductVariant,
    TextByPagePricing,
)
from .pricing import count_words, quote_product


def make_product(**kwargs):
    defaults = {
        "title": "Test",
        "slug": kwargs.pop("slug", "test-product"),
        "status": Product.Status.PUBLISHED,
        "published_at": timezone.now(),
        "base_price_amount": 5000,
    }
    defaults.update(kwargs)
    return Product.objects.create(**defaults)


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
            price_per_page_amount=7000,
            setup_fee_amount=3000,
            minimum_pages=1,
        )

    def quote_words(self, n):
        text = " ".join(["cuvânt"] * n)
        return quote_product(self.product, inputs={"message_text": text})

    def test_page_math_example_from_spec(self):
        # ceil(247/100) = 3 pages -> 30 + 3*70 = 240 RON
        quote = self.quote_words(247)
        self.assertEqual(quote.breakdown["pages"], 3)
        self.assertEqual(quote.unit_price_amount, 24000)

    def test_minimum_pages(self):
        quote = self.quote_words(1)
        self.assertEqual(quote.breakdown["pages"], 1)
        self.assertEqual(quote.unit_price_amount, 10000)

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
