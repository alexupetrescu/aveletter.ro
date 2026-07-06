import math
import re
from collections import Counter
from dataclasses import dataclass, field

from django.core.exceptions import ValidationError

from .models import Product, ProductInputField, ProductOption

TEXT_FIELD_TYPES = frozenset({
    ProductInputField.FieldType.SHORT_TEXT,
    ProductInputField.FieldType.LONG_TEXT,
})


def _is_mandatory_text_field(product, input_field):
    """Client text cannot be blank on letter / ornament products."""
    if input_field.field_type not in TEXT_FIELD_TYPES:
        return False
    if input_field.required:
        return True
    if product.product_type in (
        Product.ProductType.TEXT_BY_PAGE,
        Product.ProductType.ORNAMENT,
    ):
        return True
    pricing = getattr(product, "text_pricing", None)
    if pricing and pricing.text_field_key == input_field.key:
        return True
    return False

WORD_RE = re.compile(r"\b[\wăâîșțĂÂÎȘȚ'-]+\b", re.UNICODE)


@dataclass
class PriceQuote:
    unit_price_amount: int          # gross, in bani (VAT handled at order time)
    currency: str
    breakdown: dict
    normalized_inputs: dict
    warnings: list = field(default_factory=list)


def count_words(text: str) -> int:
    if not text:
        return 0
    return len(WORD_RE.findall(text))


def _validate_options(product, selected_options):
    """
    Every selected option must belong to THIS product, and every option group's
    required / min_selections / max_selections must be satisfied.
    """
    valid_option_ids = set(
        ProductOption.objects.filter(
            group__product=product, is_active=True,
        ).values_list("id", flat=True)
    )

    for opt in selected_options:
        if opt.id not in valid_option_ids:
            raise ValidationError(
                f"Opțiunea „{opt}” nu aparține produsului „{product}”."
            )

    counts = Counter(opt.group_id for opt in selected_options)
    for group in product.option_groups.all():
        n = counts.get(group.id, 0)
        if group.required and n < max(1, group.min_selections):
            raise ValidationError(f"Grupul de opțiuni „{group.name}” este obligatoriu.")
        if n < group.min_selections:
            raise ValidationError(
                f"Selectează cel puțin {group.min_selections} în „{group.name}”."
            )
        if group.max_selections and n > group.max_selections:
            raise ValidationError(
                f"Selectează cel mult {group.max_selections} în „{group.name}”."
            )


def _validate_inputs(product, inputs, *, preview=False):
    """Enforce required flags and char/word limits declared on input fields."""
    for input_field in product.input_fields.all():
        value = inputs.get(input_field.key)
        if input_field.field_type == input_field.FieldType.FILE:
            continue
        text = "" if value is None else str(value)
        must_have_value = (
            _is_mandatory_text_field(product, input_field)
            or input_field.required
        )
        if must_have_value and not text.strip():
            if preview:
                continue
            raise ValidationError(f"„{input_field.label}” este obligatoriu.")
        if not text:
            continue
        if input_field.min_chars is not None and len(text) < input_field.min_chars:
            raise ValidationError(
                f"„{input_field.label}” trebuie să aibă cel puțin "
                f"{input_field.min_chars} caractere."
            )
        if input_field.max_chars is not None and len(text) > input_field.max_chars:
            raise ValidationError(
                f"„{input_field.label}” trebuie să aibă cel mult "
                f"{input_field.max_chars} caractere."
            )
        words = count_words(text)
        if input_field.min_words is not None and words < input_field.min_words:
            raise ValidationError(
                f"„{input_field.label}” trebuie să aibă cel puțin "
                f"{input_field.min_words} cuvinte."
            )
        if input_field.max_words is not None and words > input_field.max_words:
            raise ValidationError(
                f"„{input_field.label}” trebuie să aibă cel mult "
                f"{input_field.max_words} cuvinte."
            )
        if input_field.validation_regex:
            if not re.fullmatch(input_field.validation_regex, text):
                raise ValidationError(f"„{input_field.label}” are un format invalid.")


def _estimate_pages(word_count: int, words_per_page: int, *, round_up: bool) -> int:
    if not words_per_page or word_count <= 0:
        return 0
    raw = word_count / words_per_page
    return math.ceil(raw) if round_up else int(raw)


def _effective_setup_fee(pricing, base_amount: int) -> int:
    """When setup fee is 0, fall back to the product base price."""
    if pricing.setup_fee_amount > 0:
        return pricing.setup_fee_amount
    return base_amount


def _compute_text_pricing(pricing, text: str, *, base_amount: int) -> tuple[int, dict]:
    """Return (text_amount, breakdown_item) for text-based products."""
    from .models import TextByPagePricing

    word_count = count_words(text)
    char_count = len(text)
    mode = pricing.pricing_mode
    setup = _effective_setup_fee(pricing, base_amount)

    estimated_pages = 0
    if pricing.average_words_per_page:
        estimated_pages = _estimate_pages(
            word_count,
            pricing.average_words_per_page,
            round_up=pricing.round_up,
        )

    if mode == TextByPagePricing.PricingMode.PER_WORD:
        unit_count = word_count
        text_amount = setup + unit_count * pricing.price_per_unit_amount
        item = {
            "type": "text_pricing",
            "pricing_mode": mode,
            "word_count": word_count,
            "unit_count": unit_count,
            "price_per_unit_amount": pricing.price_per_unit_amount,
            "setup_fee_amount": setup,
            "amount": text_amount,
        }
        if estimated_pages:
            item["estimated_pages"] = estimated_pages
        return text_amount, item

    if mode == TextByPagePricing.PricingMode.PER_WORD_BLOCK:
        block_size = pricing.words_per_page
        included_threshold = pricing.average_words_per_page or block_size
        if block_size and word_count > included_threshold:
            chargeable_words = word_count - included_threshold
            raw_extra = chargeable_words / block_size
            extra_blocks = (
                math.ceil(raw_extra) if pricing.round_up else int(raw_extra)
            )
        else:
            extra_blocks = 0
        raw_blocks = word_count / block_size if block_size else 0
        blocks = math.ceil(raw_blocks) if pricing.round_up else int(raw_blocks)
        blocks = max(blocks, 1) if word_count > 0 else 0
        text_amount = setup + extra_blocks * pricing.price_per_unit_amount
        item = {
            "type": "text_pricing",
            "pricing_mode": mode,
            "word_count": word_count,
            "words_per_block": block_size,
            "included_words_threshold": included_threshold,
            "blocks": blocks,
            "extra_blocks": extra_blocks,
            "price_per_unit_amount": pricing.price_per_unit_amount,
            "setup_fee_amount": setup,
            "amount": text_amount,
        }
        if estimated_pages:
            item["estimated_pages"] = estimated_pages
        return text_amount, item

    if mode == TextByPagePricing.PricingMode.PER_CHARACTER:
        unit_count = char_count
        text_amount = setup + unit_count * pricing.price_per_unit_amount
        item = {
            "type": "text_pricing",
            "pricing_mode": mode,
            "char_count": char_count,
            "unit_count": unit_count,
            "price_per_unit_amount": pricing.price_per_unit_amount,
            "setup_fee_amount": setup,
            "amount": text_amount,
        }
        if estimated_pages:
            item["estimated_pages"] = estimated_pages
        return text_amount, item

    # per_page — first page included in base product price
    setup = pricing.setup_fee_amount  # per-page setup does not fall back to base
    raw_pages = word_count / pricing.words_per_page if pricing.words_per_page else 0
    pages = math.ceil(raw_pages) if pricing.round_up else int(raw_pages)
    pages = max(pages, pricing.minimum_pages)
    if pricing.maximum_pages is not None:
        pages = min(pages, pricing.maximum_pages)
    extra_pages = max(0, pages - 1)
    text_amount = setup + extra_pages * pricing.price_per_unit_amount
    return text_amount, {
        "type": "text_pricing",
        "pricing_mode": mode,
        "word_count": word_count,
        "words_per_page": pricing.words_per_page,
        "pages": pages,
        "estimated_pages": pages,
        "extra_pages": extra_pages,
        "setup_fee_amount": setup,
        "price_per_unit_amount": pricing.price_per_unit_amount,
        "amount": text_amount,
    }


def quote_product(product, *, variant=None, selected_options=None, inputs=None,
                  validate=True, preview=False):
    selected_options = list(selected_options or [])
    inputs = inputs or {}

    if validate:
        _validate_options(product, selected_options)
        _validate_inputs(product, inputs, preview=preview)

    base_amount = (
        variant.effective_price_amount
        if variant is not None
        else product.base_price_amount
    )

    breakdown = {
        "base_amount": base_amount,
        "option_amount": 0,
        "pricing_type": product.product_type,
        "items": [],
    }

    option_amount = 0
    for option in selected_options:
        option_amount += option.price_delta_amount
        breakdown["items"].append({
            "type": "option",
            "label": str(option),
            "amount": option.price_delta_amount,
        })

    text_amount = 0
    normalized = dict(inputs)

    if product.product_type == product.ProductType.TEXT_BY_PAGE:
        pricing = product.text_pricing
        text = inputs.get(pricing.text_field_key, "")
        text_amount, item = _compute_text_pricing(pricing, text, base_amount=base_amount)
        breakdown["items"].append(item)
        normalized["_word_count"] = item.get("word_count", 0)
        if "pages" in item:
            normalized["_estimated_pages"] = item["pages"]
            breakdown["word_count"] = item["word_count"]
            breakdown["pages"] = item["pages"]
            breakdown["estimated_pages"] = item.get("estimated_pages", item["pages"])
            breakdown["extra_pages"] = item.get("extra_pages", 0)
        elif "blocks" in item:
            breakdown["word_count"] = item["word_count"]
            breakdown["blocks"] = item["blocks"]
            breakdown["extra_blocks"] = item.get("extra_blocks", 0)
            breakdown["words_per_block"] = item.get("words_per_block")
            if item.get("estimated_pages"):
                normalized["_estimated_pages"] = item["estimated_pages"]
                breakdown["estimated_pages"] = item["estimated_pages"]
        elif item.get("estimated_pages"):
            normalized["_estimated_pages"] = item["estimated_pages"]
            breakdown["estimated_pages"] = item["estimated_pages"]
        if "word_count" in item and "word_count" not in breakdown:
            breakdown["word_count"] = item["word_count"]
        if "char_count" in item:
            normalized["_char_count"] = item["char_count"]
            breakdown["char_count"] = item["char_count"]
        breakdown["pricing_mode"] = item.get("pricing_mode")

        # Word/character modes absorb base price into setup when setup fee is 0.
        from .models import TextByPagePricing
        mode = item.get("pricing_mode")
        if (
            mode in (
                TextByPagePricing.PricingMode.PER_WORD,
                TextByPagePricing.PricingMode.PER_WORD_BLOCK,
                TextByPagePricing.PricingMode.PER_CHARACTER,
            )
            and pricing.setup_fee_amount == 0
        ):
            base_amount = 0
            breakdown["base_amount"] = 0

    breakdown["option_amount"] = option_amount

    raw_total = base_amount + option_amount + text_amount
    total = max(0, raw_total)

    warnings = []
    if raw_total < 0:
        warnings.append(
            "Prețul calculat era negativ; s-a setat la 0. Verifică delta opțiunilor."
        )

    return PriceQuote(
        unit_price_amount=total,
        currency=product.currency,
        breakdown=breakdown,
        normalized_inputs=normalized,
        warnings=warnings,
    )
