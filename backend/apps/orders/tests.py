import threading

from django.db import connection
from django.test import TestCase, TransactionTestCase

from apps.site_config.models import SiteConfig

from .models import InvoiceSeries, TaxConfig, VatRate
from .services import _compute_shipping_amount
from .tax import compute_vat


def make_tax_config(vat_enabled=False, prices_include_vat=True):
    exempt = VatRate.objects.create(
        name="Neplătitor", rate_bp=0, is_exempt=True,
        legal_mention="Neplătitor de TVA",
    )
    return TaxConfig.objects.create(
        vat_enabled=vat_enabled,
        prices_include_vat=prices_include_vat,
        default_vat_rate=exempt,
    )


class ComputeVatTests(TestCase):
    def test_vat_off_passes_amount_through(self):
        config = make_tax_config(vat_enabled=False)
        standard = VatRate.objects.create(name="Standard 19%", rate_bp=1900)
        result = compute_vat(10000, standard, config)
        self.assertEqual(result.net_amount, 10000)
        self.assertEqual(result.vat_amount, 0)
        self.assertEqual(result.gross_amount, 10000)
        self.assertTrue(result.is_exempt)

    def test_exempt_rate_even_when_vat_on(self):
        config = make_tax_config(vat_enabled=True)
        result = compute_vat(10000, config.default_vat_rate, config)
        self.assertEqual(result.vat_amount, 0)
        self.assertTrue(result.is_exempt)
        self.assertEqual(result.legal_mention, "Neplătitor de TVA")

    def test_none_rate_falls_back_to_exempt(self):
        config = make_tax_config(vat_enabled=True)
        result = compute_vat(10000, None, config)
        self.assertEqual(result.vat_amount, 0)
        self.assertTrue(result.is_exempt)

    def test_vat_on_prices_include_vat_extracts(self):
        config = make_tax_config(vat_enabled=True, prices_include_vat=True)
        standard = VatRate.objects.create(name="Standard 19%", rate_bp=1900)
        result = compute_vat(11900, standard, config)
        self.assertEqual(result.gross_amount, 11900)
        self.assertEqual(result.net_amount, 10000)
        self.assertEqual(result.vat_amount, 1900)
        # Invariant: net + vat == gross
        self.assertEqual(result.net_amount + result.vat_amount, result.gross_amount)

    def test_vat_on_prices_exclude_vat_adds(self):
        config = make_tax_config(vat_enabled=True, prices_include_vat=False)
        standard = VatRate.objects.create(name="Standard 19%", rate_bp=1900)
        result = compute_vat(10000, standard, config)
        self.assertEqual(result.net_amount, 10000)
        self.assertEqual(result.vat_amount, 1900)
        self.assertEqual(result.gross_amount, 11900)

    def test_rounding_invariant_holds(self):
        config = make_tax_config(vat_enabled=True, prices_include_vat=True)
        standard = VatRate.objects.create(name="Standard 19%", rate_bp=1900)
        for amount in (1, 3, 99, 101, 12345, 99999):
            result = compute_vat(amount, standard, config)
            self.assertEqual(
                result.net_amount + result.vat_amount, result.gross_amount,
                f"invariant broken for {amount}",
            )


class ShippingAmountTests(TestCase):
    def setUp(self):
        self.config = SiteConfig.objects.create(
            delivery_fee_amount=2500,
            free_shipping_threshold_amount=30000,
        )

    def test_fee_below_threshold(self):
        self.assertEqual(
            _compute_shipping_amount(29999),
            2500,
        )

    def test_free_at_threshold(self):
        self.assertEqual(_compute_shipping_amount(30000), 0)

    def test_free_above_threshold(self):
        self.assertEqual(_compute_shipping_amount(50000), 0)

    def test_no_fee_when_delivery_zero(self):
        self.config.delivery_fee_amount = 0
        self.config.save()
        self.assertEqual(_compute_shipping_amount(1000), 0)

    def test_fee_always_when_no_threshold(self):
        self.config.free_shipping_threshold_amount = None
        self.config.save()
        self.assertEqual(_compute_shipping_amount(999999), 2500)


class InvoiceSeriesTests(TransactionTestCase):
    def test_sequential_gapless(self):
        series = InvoiceSeries.objects.create(code="AVE")
        numbers = [series.reserve_number() for _ in range(5)]
        self.assertEqual(numbers, [1, 2, 3, 4, 5])
        series.refresh_from_db()
        self.assertEqual(series.next_number, 6)

    def test_concurrent_reservations_no_duplicates(self):
        series = InvoiceSeries.objects.create(code="CONC")
        results = []
        errors = []

        def worker():
            try:
                results.append(series.reserve_number())
            except Exception as exc:  # pragma: no cover
                errors.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(errors, [])
        self.assertEqual(sorted(results), list(range(1, 9)))
