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


class AuthorSerializer(serializers.Serializer):
    name = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()
    socials = serializers.SerializerMethodField()

    def get_name(self, user):
        return user.get_full_name() or user.get_username()

    def get_photo(self, user):
        profile = getattr(user, "author_profile", None)
        if profile and profile.photo_id:
            return _asset_data(profile.photo, self.context.get("request"))
        return None

    def get_bio(self, user):
        profile = getattr(user, "author_profile", None)
        return profile.bio if profile else ""

    def get_socials(self, user):
        profile = getattr(user, "author_profile", None)
        if not profile:
            return {}
        socials = {}
        if profile.instagram_url:
            socials["instagram"] = profile.instagram_url
        if profile.facebook_url:
            socials["facebook"] = profile.facebook_url
        return socials


class PostListSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    featured_image = serializers.SerializerMethodField()
    author = AuthorSerializer(read_only=True)

    class Meta:
        model = Post
        fields = [
            "title", "slug", "excerpt", "reading_time", "published_at",
            "category", "tags", "featured_image", "author",
        ]

    def get_featured_image(self, obj):
        return _asset_data(obj.featured_image, self.context.get("request"))


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
