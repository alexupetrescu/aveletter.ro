from django.contrib.postgres.search import SearchQuery, SearchRank, TrigramSimilarity
from django.core.exceptions import ValidationError
from django.db.models import F, Q, Value
from django.db.models.functions import Greatest
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.blog.models import Post

from .category_utils import categories_prefetch
from .models import Product, ProductCategory, ProductOption, ProductVariant
from .pricing import quote_product
from .serializers import (
    ProductCategorySerializer,
    ProductDetailSerializer,
    ProductListSerializer,
    QuoteRequestSerializer,
)


class ProductCategoryListView(generics.ListAPIView):
    serializer_class = ProductCategorySerializer
    queryset = ProductCategory.objects.select_related("image").all()
    pagination_class = None


class ProductListView(generics.ListAPIView):
    serializer_class = ProductListSerializer

    def get_queryset(self):
        qs = (
            Product.objects.live()
            .select_related("featured_image")
            .prefetch_related(categories_prefetch())
        )
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(
                Q(categories__slug=category) | Q(categories__parent__slug=category),
            ).distinct()
        if self.request.query_params.get("featured"):
            qs = qs.filter(is_featured=True)
        return qs


class ProductDetailView(generics.RetrieveAPIView):
    serializer_class = ProductDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return (
            Product.objects.live()
            .select_related("featured_image")
            .prefetch_related(
                categories_prefetch(),
                "productimage_set__asset",
                "variants",
                "option_groups__options__image",
                "input_fields",
            )
        )


class ProductQuoteView(APIView):
    """
    The ONLY price source the customer ever sees. The frontend never computes
    pages or totals itself.
    """

    def post(self, request, slug):
        product = get_object_or_404(Product.objects.live(), slug=slug)
        serializer = QuoteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        variant = None
        variant_id = data.get("variant_id")
        if variant_id:
            variant = get_object_or_404(
                ProductVariant, pk=variant_id, product=product, is_active=True,
            )

        options = list(
            ProductOption.objects.filter(pk__in=data.get("options", []))
            .select_related("group")
        )

        try:
            quote = quote_product(
                product,
                variant=variant,
                selected_options=options,
                inputs=data.get("inputs", {}),
                preview=True,
            )
        except ValidationError as exc:
            return Response({"errors": exc.messages}, status=400)

        return Response({
            "unit_price_amount": quote.unit_price_amount,
            "currency": quote.currency,
            "breakdown": quote.breakdown,
            "warnings": quote.warnings,
        })


class SearchView(APIView):
    """Postgres FTS + trigram similarity over products and blog posts."""

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return Response({"products": [], "posts": []})

        search_query = SearchQuery(q, config="simple")

        products = (
            Product.objects.live()
            .select_related("featured_image")
            .prefetch_related(categories_prefetch())
            .annotate(
                similarity=Greatest(
                    TrigramSimilarity("title", q),
                    TrigramSimilarity("short_description", q),
                ),
            )
            .filter(
                Q(title__icontains=q)
                | Q(short_description__icontains=q)
                | Q(description_text__icontains=q)
                | Q(similarity__gt=0.2)
            )
            .order_by("-is_featured", "-similarity")[:12]
        )

        posts = (
            Post.objects.live()
            .select_related("category", "author", "featured_image")
            .annotate(
                rank=SearchRank(F("search_vector"), search_query),
                similarity=TrigramSimilarity("title", q),
            )
            .filter(Q(search_vector=search_query) | Q(similarity__gt=0.2))
            .order_by("-rank", "-similarity")[:6]
        )

        from apps.blog.serializers import PostListSerializer

        return Response({
            "products": ProductListSerializer(
                products, many=True, context={"request": request},
            ).data,
            "posts": PostListSerializer(
                posts, many=True, context={"request": request},
            ).data,
        })
