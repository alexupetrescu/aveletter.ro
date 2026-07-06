from rest_framework import generics

from .models import Post
from .serializers import PostDetailSerializer, PostListSerializer


class PostListView(generics.ListAPIView):
    serializer_class = PostListSerializer

    def get_queryset(self):
        qs = (
            Post.objects.live()
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
