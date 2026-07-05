from rest_framework import serializers

from .models import Category, Post, Tag


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["name", "slug", "description"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["name", "slug"]


def _asset_data(asset, request=None):
    if not asset or not asset.file:
        return None
    url = asset.file.url
    return {
        "url": request.build_absolute_uri(url) if request else url,
        "alt_text": asset.alt_text,
        "width": asset.width,
        "height": asset.height,
    }


class PostListSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    featured_image = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            "title", "slug", "excerpt", "reading_time", "published_at",
            "category", "tags", "featured_image", "author_name",
        ]

    def get_featured_image(self, obj):
        return _asset_data(obj.featured_image, self.context.get("request"))

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.get_username()


class PostDetailSerializer(PostListSerializer):
    og_image = serializers.SerializerMethodField()

    class Meta(PostListSerializer.Meta):
        fields = PostListSerializer.Meta.fields + [
            "body", "body_text", "schema_version",
            "seo_title", "seo_description", "og_image",
            "canonical_url", "noindex",
        ]

    def get_og_image(self, obj):
        return _asset_data(obj.og_image, self.context.get("request"))
