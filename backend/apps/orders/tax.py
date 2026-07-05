from dataclasses import dataclass


@dataclass
class VatResult:
    net_amount: int      # bani, ex-VAT
    vat_amount: int      # bani
    gross_amount: int    # bani, net + vat
    rate_bp: int
    is_exempt: bool
    legal_mention: str


def compute_vat(gross_or_net_amount: int, vat_rate, tax_config) -> VatResult:
    """
    One rule, two modes.

    TVA OFF (vat_enabled=False) or exempt rate:
        no VAT. net == gross == input amount. vat_amount = 0.
    TVA ON:
        prices_include_vat=True  -> input is GROSS, extract VAT out of it.
        prices_include_vat=False -> input is NET, add VAT on top.
    """
    amount = gross_or_net_amount

    if not tax_config.vat_enabled or vat_rate is None or vat_rate.is_exempt:
        return VatResult(
            net_amount=amount,
            vat_amount=0,
            gross_amount=amount,
            rate_bp=0,
            is_exempt=True,
            legal_mention=(vat_rate.legal_mention if vat_rate else "Neplătitor de TVA"),
        )

    rate_bp = vat_rate.rate_bp  # e.g. 1900 for 19%

    if tax_config.prices_include_vat:
        # amount is gross; net = gross * 10000 / (10000 + rate_bp)
        net = round(amount * 10000 / (10000 + rate_bp))
        vat = amount - net
        gross = amount
    else:
        # amount is net; vat on top
        net = amount
        vat = round(amount * rate_bp / 10000)
        gross = net + vat

    return VatResult(
        net_amount=net,
        vat_amount=vat,
        gross_amount=gross,
        rate_bp=rate_bp,
        is_exempt=False,
        legal_mention=vat_rate.legal_mention,
    )
