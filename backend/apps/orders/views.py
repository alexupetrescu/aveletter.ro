from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.shop.models import Product, ProductOption, ProductVariant
from apps.shop.pricing import quote_product

from .models import Cart, CartItem, CartUpload, Invoice, Order
from .serializers import CartSerializer, InvoiceSerializer, OrderSerializer

CART_KEY_HEADER = "X-Cart-Key"

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_UPLOAD_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/heic",
    "application/pdf",
}


def _cart_key(request) -> str:
    return (request.headers.get(CART_KEY_HEADER) or "").strip()[:100]


def _get_cart(request, create=False) -> Cart | None:
    key = _cart_key(request)
    if not key:
        return None
    cart = Cart.objects.filter(session_key=key).first()
    if cart is None and create:
        cart = Cart.objects.create(session_key=key)
    return cart


def _requote_item(item: CartItem):
    """Cart prices go stale — re-quote from the single pricing truth."""
    quote = quote_product(
        item.product,
        variant=item.variant,
        selected_options=list(item.selected_options.all()),
        inputs=item.inputs,
    )
    if (
        item.unit_price_amount != quote.unit_price_amount
        or item.price_breakdown != quote.breakdown
    ):
        item.unit_price_amount = quote.unit_price_amount
        item.price_breakdown = quote.breakdown
        item.save(update_fields=["unit_price_amount", "price_breakdown", "updated_at"])


def _cart_response(request, cart: Cart | None):
    if cart is None:
        return Response({"id": None, "currency": "RON", "items": [], "subtotal_amount": 0})
    for item in cart.items.select_related("product", "variant").prefetch_related(
        "selected_options__group",
    ):
        _requote_item(item)
    cart.refresh_from_db()
    return Response(CartSerializer(cart, context={"request": request}).data)


class CartView(APIView):
    def get(self, request):
        return _cart_response(request, _get_cart(request))


class CartItemsView(APIView):
    def post(self, request):
        if not _cart_key(request):
            return Response(
                {"errors": [f"Lipsește headerul {CART_KEY_HEADER}."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cart = _get_cart(request, create=True)

        product = get_object_or_404(
            Product.objects.live(), slug=request.data.get("product_slug"),
        )
        variant = None
        variant_id = request.data.get("variant_id")
        if variant_id:
            variant = get_object_or_404(
                ProductVariant, pk=variant_id, product=product, is_active=True,
            )
        options = list(
            ProductOption.objects.filter(
                pk__in=request.data.get("options", []),
            ).select_related("group")
        )
        inputs = request.data.get("inputs") or {}
        try:
            quantity = max(1, int(request.data.get("quantity", 1)))
        except (TypeError, ValueError):
            quantity = 1

        try:
            quote = quote_product(
                product, variant=variant, selected_options=options, inputs=inputs,
            )
        except ValidationError as exc:
            return Response({"errors": exc.messages}, status=status.HTTP_400_BAD_REQUEST)

        item = CartItem.objects.create(
            cart=cart,
            product=product,
            variant=variant,
            quantity=quantity,
            inputs=quote.normalized_inputs,
            price_breakdown=quote.breakdown,
            unit_price_amount=quote.unit_price_amount,
            currency=quote.currency,
        )
        item.selected_options.set(options)
        return _cart_response(request, cart)


class CartItemDetailView(APIView):
    def _get_item(self, request, item_id):
        cart = _get_cart(request)
        if cart is None:
            return None
        return CartItem.objects.filter(cart=cart, pk=item_id).first()

    def patch(self, request, item_id):
        item = self._get_item(request, item_id)
        if item is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if "quantity" in request.data:
            try:
                item.quantity = max(1, int(request.data["quantity"]))
            except (TypeError, ValueError):
                pass
        if "inputs" in request.data:
            item.inputs = request.data["inputs"] or {}
        if "options" in request.data:
            options = list(
                ProductOption.objects.filter(
                    pk__in=request.data["options"],
                ).select_related("group")
            )
            item.selected_options.set(options)
        if "variant_id" in request.data:
            variant_id = request.data["variant_id"]
            item.variant = (
                get_object_or_404(
                    ProductVariant, pk=variant_id, product=item.product, is_active=True,
                )
                if variant_id else None
            )

        try:
            quote = quote_product(
                item.product,
                variant=item.variant,
                selected_options=list(item.selected_options.all()),
                inputs=item.inputs,
            )
        except ValidationError as exc:
            return Response({"errors": exc.messages}, status=status.HTTP_400_BAD_REQUEST)

        item.inputs = quote.normalized_inputs
        item.unit_price_amount = quote.unit_price_amount
        item.price_breakdown = quote.breakdown
        item.save()
        return _cart_response(request, item.cart)

    def delete(self, request, item_id):
        item = self._get_item(request, item_id)
        if item is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        cart = item.cart
        item.delete()
        return _cart_response(request, cart)


class CartItemUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, item_id):
        cart = _get_cart(request)
        item = CartItem.objects.filter(cart=cart, pk=item_id).first() if cart else None
        if item is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        field_key = request.data.get("field_key", "")
        upload_file = request.FILES.get("file")
        if not field_key or not upload_file:
            return Response(
                {"errors": ["„field_key” și „file” sunt obligatorii."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not item.product.input_fields.filter(
            key=field_key, field_type="file",
        ).exists():
            return Response(
                {"errors": [f"Produsul nu are câmp de fișier „{field_key}”."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if upload_file.size > MAX_UPLOAD_BYTES:
            return Response(
                {"errors": ["Fișier prea mare (max. 20 MB)."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        content_type = getattr(upload_file, "content_type", "") or ""
        if content_type not in ALLOWED_UPLOAD_TYPES:
            return Response(
                {"errors": [f"Tipul de fișier „{content_type}” nu este permis."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # One upload per field: replace previous.
        item.uploads.filter(field_key=field_key).delete()
        upload = CartUpload.objects.create(
            cart_item=item,
            field_key=field_key,
            file=upload_file,
            original_filename=upload_file.name,
            mime_type=content_type,
            size_bytes=upload_file.size,
        )
        inputs = dict(item.inputs)
        inputs[field_key] = {
            "upload_id": upload.pk,
            "filename": upload.original_filename,
            "url": upload.file.url,
        }
        item.inputs = inputs
        item.save(update_fields=["inputs", "updated_at"])
        return _cart_response(request, cart)


class OrderDetailView(APIView):
    def get(self, request, order_number):
        order = get_object_or_404(
            Order.objects.select_related("billing_address", "shipping_address")
            .prefetch_related("lines"),
            order_number=order_number,
        )
        return Response(OrderSerializer(order, context={"request": request}).data)


class OrderInvoiceView(APIView):
    def get(self, request, order_number):
        order = get_object_or_404(Order, order_number=order_number)
        invoice = order.invoices.filter(kind=Invoice.Kind.INVOICE).first()
        if invoice is None:
            return Response(
                {"detail": "No invoice issued yet."}, status=status.HTTP_404_NOT_FOUND,
            )
        return Response(InvoiceSerializer(invoice, context={"request": request}).data)
