from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PublishedQuerySet(models.QuerySet):
    def live(self):
        """Live = PUBLISHED and the publish moment has arrived. Nothing else."""
        now = timezone.now()
        return self.filter(
            status=Publishable.Status.PUBLISHED,
            published_at__isnull=False,
            published_at__lte=now,
        )

    def scheduled(self):
        """Editorially scheduled: marked PUBLISHED but dated in the future."""
        now = timezone.now()
        return self.filter(
            status=Publishable.Status.PUBLISHED,
            published_at__gt=now,
        )

    def draft(self):
        return self.filter(status=Publishable.Status.DRAFT)

    def archived(self):
        return self.filter(status=Publishable.Status.ARCHIVED)


class Publishable(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    seo_title = models.CharField(max_length=70, blank=True)
    seo_description = models.CharField(max_length=160, blank=True)
    # Truth source. Future value = scheduled. Past value + PUBLISHED = live.
    published_at = models.DateTimeField(null=True, blank=True)

    objects = PublishedQuerySet.as_manager()

    class Meta:
        abstract = True

    @property
    def is_live(self):
        return (
            self.status == self.Status.PUBLISHED
            and self.published_at is not None
            and self.published_at <= timezone.now()
        )

    def save(self, *args, **kwargs):
        # Publishing with no date means "publish now".
        if self.status == self.Status.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class Currency(models.TextChoices):
    RON = "RON", "Romanian Leu"
    EUR = "EUR", "Euro"


class MoneyModel(models.Model):
    amount = models.PositiveIntegerField(help_text="Smallest currency unit. RON bani.")
    currency = models.CharField(
        max_length=3,
        choices=Currency.choices,
        default=Currency.RON,
    )

    class Meta:
        abstract = True


def format_bani(amount: int) -> str:
    """5000 -> '50.00'"""
    return f"{amount // 100}.{amount % 100:02d}"
