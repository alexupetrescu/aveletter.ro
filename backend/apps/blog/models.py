from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import models

from apps.core.models import Publishable, PublishedQuerySet


class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Tag(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Post(Publishable):
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    body = models.JSONField(default=dict)
    body_text = models.TextField(blank=True)
    schema_version = models.PositiveSmallIntegerField(default=1)
    excerpt = models.TextField(blank=True)
    reading_time = models.PositiveIntegerField(default=0)
    featured_image = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL,
    )
    tags = models.ManyToManyField(Tag, blank=True)
    og_image = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    canonical_url = models.URLField(blank=True)
    noindex = models.BooleanField(default=False)
    search_vector = SearchVectorField(null=True)

    objects = PublishedQuerySet.as_manager()

    class Meta:
        ordering = ["-published_at", "-created_at"]
        indexes = [
            models.Index(fields=["status", "-published_at"]),
            GinIndex(fields=["search_vector"]),
        ]


class PostRevision(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="revisions")
    body = models.JSONField(default=dict)
    body_text = models.TextField(blank=True)
    schema_version = models.PositiveSmallIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.post.title} @ {self.created_at:%Y-%m-%d %H:%M}"


class SlugRedirect(models.Model):
    old_path = models.CharField(max_length=500, unique=True)
    new_path = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.old_path} -> {self.new_path}"


class AuthorProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="author_profile",
    )
    photo = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    bio = models.TextField(blank=True)
    instagram_url = models.URLField(blank=True)
    facebook_url = models.URLField(blank=True)

    class Meta:
        verbose_name = "author profile"
        verbose_name_plural = "author profiles"

    def __str__(self):
        return self.user.get_full_name() or self.user.get_username()
