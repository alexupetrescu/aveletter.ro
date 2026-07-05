from django.contrib.postgres.search import SearchVector
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Post


@receiver(post_save, sender=Post)
def update_search_vector(sender, instance, **kwargs):
    # queryset.update() bypasses save() and signals, so no recursion.
    Post.objects.filter(pk=instance.pk).update(
        search_vector=(
            SearchVector("title", weight="A")
            + SearchVector("body_text", weight="B")
        )
    )
