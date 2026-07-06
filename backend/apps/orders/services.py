from django.core.files.base import ContentFile

from django.db import IntegrityError, transaction

from django.utils import timezone



from apps.shop.pricing import quote_product

from apps.site_config.models import SiteConfig



from .models import (

    Address,

    Cart,

    Order,

    OrderLine,

    TaxConfig,

    generate_order_number,

)

from .tax import compute_vat





class CheckoutError(Exception):

    pass





def _options_snapshot(options):

    return [

        {

            "group": opt.group.name,

            "label": opt.label,

            "value": opt.value,

            "price_delta_amount": opt.price_delta_amount,

        }

        for opt in options

    ]





def _freeze_uploads(cart_item, inputs_snapshot):

    """

    Copy cart upload files to durable order storage and rewrite the input

    references so production files don't live only in the ephemeral cart store.

    """

    from apps.media_library.models import MediaAsset



    for upload in cart_item.uploads.all():

        upload.file.open("rb")

        try:

            content = upload.file.read()

        finally:

            upload.file.close()

        asset = MediaAsset(

            kind=MediaAsset.Kind.FILE,

            visibility=MediaAsset.Visibility.PRIVATE,

            original_filename=upload.original_filename,

            mime_type=upload.mime_type,

            size_bytes=upload.size_bytes,

            title=f"Order upload: {upload.original_filename}",

        )

        asset.file.save(

            upload.original_filename or f"upload-{upload.pk}", ContentFile(content),

            save=True,

        )

        inputs_snapshot[upload.field_key] = {

            "media_asset_id": asset.pk,

            "filename": upload.original_filename,

            "url": asset.file.url,

        }

    return inputs_snapshot





def _create_order_with_number(**kwargs) -> Order:

    for _ in range(5):

        try:

            with transaction.atomic():

                return Order.objects.create(

                    order_number=generate_order_number(), **kwargs,

                )

        except IntegrityError:

            continue

    raise CheckoutError("Nu s-a putut aloca un număr de comandă unic.")





def _compute_shipping_amount(subtotal_gross: int) -> int:

    return SiteConfig.get_solo().shipping_amount_for_subtotal(subtotal_gross)





@transaction.atomic

def create_order_from_cart(

    cart: Cart,

    *,

    email: str,

    phone: str = "",

    billing_address_data: dict,

    shipping_address_data: dict | None = None,

    customer_notes: str = "",

    user=None,

) -> Order:

    """

    Re-quote every cart item (same quote_product truth as the preview), compute

    VAT per line, and freeze everything into Order + OrderLines.

    """

    items = list(

        cart.items.select_related("product", "variant", "product__vat_rate")

        .prefetch_related("selected_options__group", "uploads")

    )

    if not items:

        raise CheckoutError("Coșul este gol.")



    tax_config = TaxConfig.get_solo()



    billing = Address.objects.create(**billing_address_data)

    shipping = (

        Address.objects.create(**shipping_address_data)

        if shipping_address_data else billing

    )



    order = _create_order_with_number(

        user=user,

        email=email,

        phone=phone,

        status=Order.Status.PENDING_PAYMENT,

        billing_address=billing,

        shipping_address=shipping,

        currency=cart.currency,

        customer_notes=customer_notes,

        placed_at=timezone.now(),

        vat_enabled_snapshot=tax_config.vat_enabled,

    )



    subtotal_net = 0

    subtotal_gross = 0

    total_vat = 0

    vat_breakdown: dict[str, dict[str, int]] = {}



    for item in items:

        product = item.product

        options = list(item.selected_options.all())



        quote = quote_product(

            product,

            variant=item.variant,

            selected_options=options,

            inputs=item.inputs,

        )



        vat_rate = product.vat_rate or tax_config.default_vat_rate

        unit_vat = compute_vat(quote.unit_price_amount, vat_rate, tax_config)

        line_gross = unit_vat.gross_amount * item.quantity

        line_net = unit_vat.net_amount * item.quantity

        line_vat = unit_vat.vat_amount * item.quantity



        inputs_snapshot = _freeze_uploads(item, dict(quote.normalized_inputs))



        OrderLine.objects.create(

            order=order,

            product=product,

            variant=item.variant,

            product_title=product.title,

            product_slug=product.slug,

            variant_name=item.variant.name if item.variant else "",

            sku=(item.variant.sku if item.variant and item.variant.sku else product.sku or ""),

            quantity=item.quantity,

            unit_price_amount=unit_vat.gross_amount,

            line_total_amount=line_gross,

            unit_net_amount=unit_vat.net_amount,

            line_net_amount=line_net,

            line_vat_amount=line_vat,

            vat_rate_bp=unit_vat.rate_bp,

            vat_is_exempt=unit_vat.is_exempt,

            vat_legal_mention=unit_vat.legal_mention,

            currency=quote.currency,

            selected_options_snapshot=_options_snapshot(options),

            inputs_snapshot=inputs_snapshot,

            price_breakdown=quote.breakdown,

        )



        subtotal_net += line_net

        subtotal_gross += line_gross

        total_vat += line_vat



        key = str(unit_vat.rate_bp)

        bucket = vat_breakdown.setdefault(key, {"net": 0, "vat": 0})

        bucket["net"] += line_net

        bucket["vat"] += line_vat



    order.subtotal_net_amount = subtotal_net

    order.subtotal_amount = subtotal_gross

    order.vat_amount = total_vat

    order.shipping_amount = _compute_shipping_amount(subtotal_gross)

    order.total_amount = max(

        0, subtotal_gross + order.shipping_amount - order.discount_amount,

    )

    order.vat_breakdown = vat_breakdown

    order.save(update_fields=[

        "subtotal_net_amount", "subtotal_amount", "vat_amount",

        "shipping_amount", "total_amount", "vat_breakdown",

    ])

    return order





def mark_order_paid(order: Order) -> None:

    """Called from the payment webhook. Idempotent."""

    from .invoicing import issue_invoice



    if order.status != Order.Status.PAID:

        order.status = Order.Status.PAID

        order.paid_at = timezone.now()

        order.save(update_fields=["status", "paid_at"])

    issue_invoice(order)

