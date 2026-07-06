from django.contrib.auth import get_user_model
from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.blog.models import AuthorProfile, Category as BlogCategory
from apps.blog.models import Post, SlugRedirect, Tag
from apps.media_library.models import MediaAsset, MediaTag
from apps.orders.models import (
    Cart,
    Invoice,
    InvoiceSeries,
    Order,
    TaxConfig,
    VatRate,
)
from apps.payments.models import Payment
from apps.shop.models import (
    Product,
    ProductCategory,
    ProductImage,
    ProductInputField,
    ProductOption,
    ProductOptionGroup,
    ProductRecommendation,
    ProductVariant,
    TextByPagePricing,
)
from apps.shop.recommendations import (
    auto_cross_sell_candidates,
    auto_upsell_candidates,
)
from apps.site_config.models import HomeHero, SiteConfig

from . import serializers as s
from .permissions import CRM_AUTHENTICATION, IsStaff


class CrmViewSet(viewsets.ModelViewSet):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]

    filter_fields: dict[str, str] = {}  # query param -> ORM lookup

    def get_queryset(self):
        qs = super().get_queryset()
        for param, lookup in self.filter_fields.items():
            value = self.request.query_params.get(param)
            if value:
                qs = qs.filter(**{lookup: value})
        return qs


# ---------------------------------------------------------------------------
# Shop
# ---------------------------------------------------------------------------

class ProductCategoryViewSet(CrmViewSet):
    queryset = ProductCategory.objects.annotate(
        product_count=Count("products"),
    ).select_related("image")
    serializer_class = s.ProductCategoryCrmSerializer
    pagination_class = None


class ProductViewSet(CrmViewSet):
    queryset = Product.objects.select_related("category", "featured_image")
    filter_fields = {"status": "status", "category": "category__slug"}

    def get_queryset(self):
        qs = super().get_queryset().order_by("-updated_at")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(slug__icontains=search))
        if self.action != "list":
            qs = qs.prefetch_related(
                "variants", "option_groups__options", "input_fields",
                "productimage_set__asset",
                "outgoing_recommendations__target__featured_image",
            )
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return s.ProductCrmListSerializer
        return s.ProductCrmDetailSerializer

    @action(detail=True, methods=["get"], url_path="recommendation-suggestions")
    def recommendation_suggestions(self, request, pk=None):
        product = self.get_object()
        manual_upsell_ids = set(
            product.outgoing_recommendations.filter(
                kind=ProductRecommendation.Kind.UPSELL,
            ).values_list("target_id", flat=True)
        )
        manual_cross_ids = set(
            product.outgoing_recommendations.filter(
                kind=ProductRecommendation.Kind.CROSS_SELL,
            ).values_list("target_id", flat=True)
        )
        upsells = auto_upsell_candidates(
            product, exclude_ids=manual_upsell_ids,
        )
        cross_sells = auto_cross_sell_candidates(
            product, exclude_ids=manual_cross_ids,
        )
        serializer = s.ProductCrmListSerializer
        ctx = {"request": request}
        return Response({
            "upsells": serializer(upsells, many=True, context=ctx).data,
            "cross_sells": serializer(cross_sells, many=True, context=ctx).data,
        })


class ProductVariantViewSet(CrmViewSet):
    queryset = ProductVariant.objects.all()
    serializer_class = s.ProductVariantCrmSerializer
    filter_fields = {"product": "product_id"}
    pagination_class = None


class ProductOptionGroupViewSet(CrmViewSet):
    queryset = ProductOptionGroup.objects.prefetch_related("options")
    serializer_class = s.ProductOptionGroupCrmSerializer
    filter_fields = {"product": "product_id"}
    pagination_class = None


class ProductOptionViewSet(CrmViewSet):
    queryset = ProductOption.objects.all()
    serializer_class = s.ProductOptionCrmSerializer
    filter_fields = {"group": "group_id", "product": "group__product_id"}
    pagination_class = None


class ProductInputFieldViewSet(CrmViewSet):
    queryset = ProductInputField.objects.all()
    serializer_class = s.ProductInputFieldCrmSerializer
    filter_fields = {"product": "product_id"}
    pagination_class = None


class ProductImageViewSet(CrmViewSet):
    queryset = ProductImage.objects.select_related("asset")
    serializer_class = s.ProductImageCrmSerializer
    filter_fields = {"product": "product_id"}
    pagination_class = None


class ProductRecommendationViewSet(CrmViewSet):
    queryset = ProductRecommendation.objects.select_related(
        "target__featured_image", "source",
    )
    serializer_class = s.ProductRecommendationCrmSerializer
    filter_fields = {"product": "source_id", "kind": "kind"}
    pagination_class = None


class TextByPagePricingViewSet(CrmViewSet):
    queryset = TextByPagePricing.objects.all()
    serializer_class = s.TextByPagePricingCrmSerializer
    filter_fields = {"product": "product_id"}
    pagination_class = None


# ---------------------------------------------------------------------------
# Blog
# ---------------------------------------------------------------------------

class PostViewSet(CrmViewSet):
    queryset = Post.objects.select_related("category", "author", "featured_image")
    filter_fields = {"status": "status", "category": "category__slug"}

    def get_queryset(self):
        qs = super().get_queryset().order_by("-updated_at")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(slug__icontains=search))
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return s.PostCrmListSerializer
        return s.PostCrmDetailSerializer


class BlogCategoryViewSet(CrmViewSet):
    queryset = BlogCategory.objects.all()
    serializer_class = s.BlogCategoryCrmSerializer
    pagination_class = None


class TagViewSet(CrmViewSet):
    queryset = Tag.objects.all()
    serializer_class = s.TagCrmSerializer
    pagination_class = None


class SlugRedirectViewSet(CrmViewSet):
    queryset = SlugRedirect.objects.order_by("-created_at")
    serializer_class = s.SlugRedirectCrmSerializer


class AuthorProfileViewSet(viewsets.ViewSet):
    """Staff author profiles keyed by Django user id."""

    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]

    def _staff_users(self):
        User = get_user_model()
        return User.objects.filter(is_staff=True).order_by(
            F("first_name").asc(nulls_last=True), "username",
        )

    def list(self, request):
        staff = list(self._staff_users())
        profiles = {
            p.user_id: p
            for p in AuthorProfile.objects.select_related("photo").filter(
                user__in=staff,
            )
        }
        data = []
        for user in staff:
            profile = profiles.get(user.pk)
            if profile:
                row = s.AuthorProfileCrmSerializer(
                    profile, context={"request": request},
                ).data
            else:
                row = {
                    "id": None,
                    "user_id": user.pk,
                    "user_name": user.get_full_name() or user.get_username(),
                    "photo": None,
                    "photo_data": None,
                    "bio": "",
                    "instagram_url": "",
                    "facebook_url": "",
                }
            data.append(row)
        return Response(data)

    def retrieve(self, request, pk=None):
        User = get_user_model()
        user = User.objects.filter(pk=pk, is_staff=True).first()
        if user is None:
            return Response(status=404)
        profile, _ = AuthorProfile.objects.get_or_create(user=user)
        profile = AuthorProfile.objects.select_related("user", "photo").get(
            pk=profile.pk,
        )
        return Response(
            s.AuthorProfileCrmSerializer(profile, context={"request": request}).data,
        )

    def partial_update(self, request, pk=None):
        User = get_user_model()
        user = User.objects.filter(pk=pk, is_staff=True).first()
        if user is None:
            return Response(status=404)
        profile, _ = AuthorProfile.objects.get_or_create(user=user)
        profile = AuthorProfile.objects.select_related("user", "photo").get(
            pk=profile.pk,
        )
        serializer = s.AuthorProfileCrmSerializer(
            profile, data=request.data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------

class MediaAssetViewSet(CrmViewSet):
    queryset = MediaAsset.objects.prefetch_related("tags")
    serializer_class = s.MediaAssetSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_fields = {"kind": "kind", "visibility": "visibility"}

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(alt_text__icontains=search)
                | Q(original_filename__icontains=search)
            )
        return qs


class MediaTagViewSet(CrmViewSet):
    queryset = MediaTag.objects.all()
    serializer_class = s.MediaTagSerializer
    pagination_class = None


# ---------------------------------------------------------------------------
# Orders / fiscal
# ---------------------------------------------------------------------------

class OrderViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Orders are frozen; only status and internal notes can change."""

    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]
    queryset = Order.objects.order_by("-created_at")
    lookup_field = "order_number"
    ALLOWED_UPDATE_FIELDS = {"status", "internal_notes"}

    def get_queryset(self):
        qs = self.queryset
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(order_number__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
            )
        if self.action != "list":
            qs = qs.select_related("billing_address", "shipping_address").prefetch_related(
                "lines", "payments", "invoices__series",
            )
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return s.OrderCrmListSerializer
        return s.OrderCrmDetailSerializer

    def update(self, request, *args, **kwargs):
        disallowed = set(request.data.keys()) - self.ALLOWED_UPDATE_FIELDS
        if disallowed:
            return Response(
                {"errors": [f"Only {sorted(self.ALLOWED_UPDATE_FIELDS)} can be changed."]},
                status=400,
            )
        if "status" in request.data:
            valid = {c[0] for c in Order.Status.choices}
            if request.data["status"] not in valid:
                return Response({"errors": ["Invalid status."]}, status=400)
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)


class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]
    queryset = Invoice.objects.select_related("series", "order").order_by("-issued_at")
    serializer_class = s.InvoiceCrmSerializer


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]
    queryset = Payment.objects.select_related("order").order_by("-created_at")
    serializer_class = s.PaymentCrmSerializer


class CartViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]
    queryset = Cart.objects.prefetch_related("items").order_by("-updated_at")
    serializer_class = s.CartCrmSerializer


class VatRateViewSet(CrmViewSet):
    queryset = VatRate.objects.all()
    serializer_class = s.VatRateCrmSerializer
    pagination_class = None


class InvoiceSeriesViewSet(CrmViewSet):
    queryset = InvoiceSeries.objects.all()
    serializer_class = s.InvoiceSeriesCrmSerializer
    pagination_class = None


class TaxConfigView(APIView):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]

    def get(self, request):
        return Response(s.TaxConfigCrmSerializer(TaxConfig.get_solo()).data)

    def patch(self, request):
        config = TaxConfig.get_solo()
        serializer = s.TaxConfigCrmSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SiteConfigCrmView(APIView):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]

    def get(self, request):
        return Response(s.SiteConfigCrmSerializer(SiteConfig.get_solo()).data)

    def patch(self, request):
        config = SiteConfig.get_solo()
        serializer = s.SiteConfigCrmSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class HomeHeroCrmView(APIView):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]

    def get(self, request):
        return Response(s.HomeHeroCrmSerializer(HomeHero.get_solo()).data)

    def patch(self, request):
        hero = HomeHero.get_solo()
        serializer = s.HomeHeroCrmSerializer(hero, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

class StatsView(APIView):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]

    def get(self, request):
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        by_status = dict(
            Order.objects.values_list("status").annotate(n=Count("id")),
        )
        paid_like = [
            Order.Status.PAID, Order.Status.IN_PRODUCTION,
            Order.Status.READY_TO_SHIP, Order.Status.SHIPPED,
            Order.Status.COMPLETED,
        ]
        revenue_total = (
            Order.objects.filter(status__in=paid_like)
            .aggregate(v=Sum("total_amount"))["v"] or 0
        )
        revenue_month = (
            Order.objects.filter(status__in=paid_like, paid_at__gte=month_start)
            .aggregate(v=Sum("total_amount"))["v"] or 0
        )
        recent = s.OrderCrmListSerializer(
            Order.objects.order_by("-created_at")[:8], many=True,
        ).data
        low_stock = list(
            ProductVariant.objects.filter(
                track_stock=True, stock_quantity__lte=3, is_active=True,
            )
            .select_related("product")
            .values("id", "name", "stock_quantity", "product__title")[:10]
        )
        return Response({
            "orders_by_status": by_status,
            "revenue_total": revenue_total,
            "revenue_month": revenue_month,
            "recent_orders": recent,
            "low_stock": low_stock,
            "counts": {
                "products": Product.objects.count(),
                "posts": Post.objects.count(),
                "media": MediaAsset.objects.count(),
                "invoices": Invoice.objects.count(),
            },
        })
