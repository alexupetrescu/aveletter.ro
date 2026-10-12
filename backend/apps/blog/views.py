from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Post
from .redirects import resolve_redirect
from .serializers import CategorySerializer, PostDetailSerializer, PostListSerializer


class CategoryListView(generics.ListAPIView):
    serializer_class = CategorySerializer
    pagination_class = None

    def get_queryset(self):
        return Category.objects.filter(post__in=Post.objects.live()).distinct()


class RedirectResolveView(APIView):
    def get(self, request):
        path = request.query_params.get("path", "")
        return Response({"new_path": resolve_redirect(path)})


class PostListView(generics.ListAPIView):
    serializer_class = PostListSerializer

    def get_queryset(self):
        qs = (
            Post.objects.live()
            .order_by("-published_at", "-created_at", "-pk")
            .select_related(
                "category", "author", "author__author_profile__photo", "featured_image",
            )
            .prefetch_related("tags")
        )
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category__slug=category)
        tag = self.request.query_params.get("tag")
        if tag:
            qs = qs.filter(tags__slug=tag)
        return qs


class PostDetailView(generics.RetrieveAPIView):
    serializer_class = PostDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return (
            Post.objects.live()
            .select_related(
                "category", "author", "author__author_profile__photo",
                "featured_image", "og_image",
            )
            .prefetch_related("tags")
        )
