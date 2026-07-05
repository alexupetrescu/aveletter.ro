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

    # 1. No foreign / inactive options.
    for opt in selected_options:
        if opt.id not in valid_option_ids:
            raise ValidationError(
                f"Option '{opt}' does not belong to product '{product}'."
            )

    # 2. Per-group selection counts.
    counts = Counter(opt.group_id for opt in selected_options)
    for group in product.option_groups.all():
        n = counts.get(group.id, 0)
        if group.required and n < max(1, group.min_selections):
            raise ValidationError(f"Option group '{group.name}' is required.")
        if n < group.min_selections:
            raise ValidationError(
                f"Select at least {group.min_selections} in '{group.name}'."
            )
        if group.max_selections and n > group.max_selections:
            raise ValidationError(
                f"Select at most {group.max_selections} in '{group.name}'."
            )


def _validate_inputs(product, inputs):
    """Enforce required flags and char/word limits declared on input fields."""
    for input_field in product.input_fields.all():
        value = inputs.get(input_field.key)
        if input_field.field_type == input_field.FieldType.FILE:
            # File inputs are validated at upload time (CartUpload).
            continue
        text = "" if value is None else str(value)
        if input_field.required and not text.strip():
            raise ValidationError(f"'{input_field.label}' is required.")
        if not text:
            continue
        if input_field.min_chars is not None and len(text) < input_field.min_chars:
            raise ValidationError(
                f"'{input_field.label}' must have at least {input_field.min_chars} characters."
            )
        if input_field.max_chars is not None and len(text) > input_field.max_chars:
            raise ValidationError(
                f"'{input_field.label}' must have at most {input_field.max_chars} characters."
            )
        words = count_words(text)
        if input_field.min_words is not None and words < input_field.min_words:
            raise ValidationError(
                f"'{input_field.label}' must have at least {input_field.min_words} words."
            )
        if input_field.max_words is not None and words > input_field.max_words:
            raise ValidationError(
                f"'{input_field.label}' must have at most {input_field.max_words} words."
            )
        if input_field.validation_regex:
            if not re.fullmatch(input_field.validation_regex, text):
                raise ValidationError(f"'{input_field.label}' has an invalid format.")


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
        word_count = count_words(text)
        raw_pages = word_count / pricing.words_per_page if pricing.words_per_page else 0
        pages = math.ceil(raw_pages) if pricing.round_up else int(raw_pages)
        pages = max(pages, pricing.minimum_pages)
        if pricing.maximum_pages is not None:
            pages = min(pages, pricing.maximum_pages)
        text_amount = pricing.setup_fee_amount + pages * pricing.price_per_page_amount
        breakdown["items"].append({
            "type": "text_by_page",
            "word_count": word_count,
            "words_per_page": pricing.words_per_page,
            "pages": pages,
            "setup_fee_amount": pricing.setup_fee_amount,
            "price_per_page_amount": pricing.price_per_page_amount,
            "amount": text_amount,
        })
        normalized["_word_count"] = word_count
        normalized["_estimated_pages"] = pages
        breakdown["word_count"] = word_count
        breakdown["pages"] = pages

    breakdown["option_amount"] = option_amount

    # Clamp at zero. Negative deltas can discount but never invert the price.
    raw_total = base_amount + option_amount + text_amount
    total = max(0, raw_total)

    warnings = []
    if raw_total < 0:
        warnings.append("Computed price was negative; clamped to 0. Check option deltas.")

    return PriceQuote(
        unit_price_amount=total,
        currency=product.currency,
        breakdown=breakdown,
        normalized_inputs=normalized,
        warnings=warnings,
    )
