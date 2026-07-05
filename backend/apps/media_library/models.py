from django.conf import settings
from django.db import models


class MediaTag(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class MediaAsset(models.Model):
    class Kind(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        FILE = "file", "File"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    kind = models.CharField(max_length=10, choices=Kind.choices)
    visibility = models.CharField(
        max_length=10, choices=Visibility.choices, default=Visibility.PUBLIC,
    )
    file = models.FileField(upload_to="media/%Y/%m/")
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveBigIntegerField(null=True, blank=True)
    checksum = models.CharField(max_length=64, blank=True, db_index=True)
    title = models.CharField(max_length=255, blank=True)
    alt_text = models.CharField(max_length=500, blank=True)
    caption = models.TextField(blank=True)
    credit = models.CharField(max_length=255, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    blurhash = models.CharField(max_length=128, blank=True)
    focal_x = models.FloatField(default=0.5)
    focal_y = models.FloatField(default=0.5)
    duration = models.FloatField(null=True, blank=True)
    poster = models.ForeignKey(
        "self", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    tags = models.ManyToManyField(MediaTag, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["kind", "-created_at"]),
            models.Index(fields=["visibility", "-created_at"]),
        ]

    def __str__(self):
        return self.title or self.original_filename or self.file.name


class MediaRendition(models.Model):
    asset = models.ForeignKey(
        MediaAsset, on_delete=models.CASCADE, related_name="renditions",
    )
    file = models.FileField(upload_to="media/renditions/%Y/%m/")
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    format = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("asset", "width", "height", "format")]

    def __str__(self):
        return f"{self.asset} @ {self.width}x{self.height}"
