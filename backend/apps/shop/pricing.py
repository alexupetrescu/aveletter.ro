import math
import re
from collections import Counter
from dataclasses import dataclass, field

from django.core.exceptions import ValidationError

from .models import ProductOption

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


def _validate_inputs(product, inputs):
    """Enforce required flags and char/word limits declared on input fields."""
    for input_field in product.input_fields.all():
        value = inputs.get(input_field.key)
        if input_field.field_type == input_field.FieldType.FILE:
            continue
        text = "" if value is None else str(value)
        if input_field.required and not text.strip():
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


def _compute_text_pricing(pricing, text: str) -> tuple[int, dict]:
    """Return (text_amount, breakdown_item) for text-based products."""
    from .models import TextByPagePricing

    word_count = count_words(text)
    char_count = len(text)
    mode = pricing.pricing_mode

    if mode == TextByPagePricing.PricingMode.PER_WORD:
        unit_count = word_count
        text_amount = pricing.setup_fee_amount + unit_count * pricing.price_per_unit_amount
        return text_amount, {
            "type": "text_pricing",
            "pricing_mode": mode,
            "word_count": word_count,
            "unit_count": unit_count,
            "price_per_unit_amount": pricing.price_per_unit_amount,
            "setup_fee_amount": pricing.setup_fee_amount,
            "amount": text_amount,
        }

    if mode == TextByPagePricing.PricingMode.PER_CHARACTER:
        unit_count = char_count
        text_amount = pricing.setup_fee_amount + unit_count * pricing.price_per_unit_amount
        return text_amount, {
            "type": "text_pricing",
            "pricing_mode": mode,
            "char_count": char_count,
            "unit_count": unit_count,
            "price_per_unit_amount": pricing.price_per_unit_amount,
            "setup_fee_amount": pricing.setup_fee_amount,
            "amount": text_amount,
        }

    # per_page — first page included in base product price
    raw_pages = word_count / pricing.words_per_page if pricing.words_per_page else 0
    pages = math.ceil(raw_pages) if pricing.round_up else int(raw_pages)
    pages = max(pages, pricing.minimum_pages)
    if pricing.maximum_pages is not None:
        pages = min(pages, pricing.maximum_pages)
    extra_pages = max(0, pages - 1)
    text_amount = pricing.setup_fee_amount + extra_pages * pricing.price_per_unit_amount
    return text_amount, {
        "type": "text_pricing",
        "pricing_mode": mode,
        "word_count": word_count,
        "words_per_page": pricing.words_per_page,
        "pages": pages,
        "extra_pages": extra_pages,
        "setup_fee_amount": pricing.setup_fee_amount,
        "price_per_unit_amount": pricing.price_per_unit_amount,
        "amount": text_amount,
    }


def quote_product(product, *, variant=None, selected_options=None, inputs=None,
                  validate=True):
    selected_options = list(selected_options or [])
    inputs = inputs or {}

    if validate:
        _validate_options(product, selected_options)
        _validate_inputs(product, inputs)

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
        text_amount, item = _compute_text_pricing(pricing, text)
        breakdown["items"].append(item)
        normalized["_word_count"] = item.get("word_count", 0)
        if "pages" in item:
            normalized["_estimated_pages"] = item["pages"]
            breakdown["word_count"] = item["word_count"]
            breakdown["pages"] = item["pages"]
            breakdown["extra_pages"] = item.get("extra_pages", 0)
        if "char_count" in item:
            normalized["_char_count"] = item["char_count"]
            breakdown["char_count"] = item["char_count"]
        breakdown["pricing_mode"] = item.get("pricing_mode")

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
