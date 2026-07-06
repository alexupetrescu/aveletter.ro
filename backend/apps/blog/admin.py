from django.contrib import admin

from .models import AuthorProfile, Category, Post, PostRevision, SlugRedirect, Tag


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "sort_order"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}


class PostRevisionInline(admin.TabularInline):
    model = PostRevision
    extra = 0
    readonly_fields = ["body", "body_text", "schema_version", "created_by", "created_at"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ["title", "status", "publish_state", "category", "author", "published_at"]
    list_filter = ["status", "category"]
    search_fields = ["title", "body_text", "excerpt"]
    prepopulated_fields = {"slug": ("title",)}
    filter_horizontal = ["tags"]
    readonly_fields = ["search_vector", "created_at", "updated_at"]
    inlines = [PostRevisionInline]
    date_hierarchy = "published_at"

    @admin.display(description="State")
    def publish_state(self, obj):
        if obj.status != obj.Status.PUBLISHED:
            return obj.get_status_display()
        return "Live" if obj.is_live else "Scheduled"

    def save_model(self, request, obj, form, change):
        if not change and not obj.author_id:
            obj.author = request.user
        super().save_model(request, obj, form, change)
        PostRevision.objects.create(
            post=obj,
            body=obj.body,
            body_text=obj.body_text,
            schema_version=obj.schema_version,
            created_by=request.user,
        )


@admin.register(SlugRedirect)
class SlugRedirectAdmin(admin.ModelAdmin):
    list_display = ["old_path", "new_path", "created_at"]
    search_fields = ["old_path", "new_path"]


@admin.register(AuthorProfile)
class AuthorProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "has_photo", "has_bio"]
    search_fields = ["user__username", "user__first_name", "user__last_name", "bio"]
    raw_id_fields = ["user", "photo"]

    @admin.display(boolean=True, description="Photo")
    def has_photo(self, obj):
        return bool(obj.photo_id)

    @admin.display(boolean=True, description="Bio")
    def has_bio(self, obj):
        return bool(obj.bio)
