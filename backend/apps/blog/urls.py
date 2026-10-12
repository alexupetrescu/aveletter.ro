from django.urls import path

from .views import CategoryListView, PostDetailView, PostListView, RedirectResolveView

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="blog-category-list"),
    path("redirects/resolve/", RedirectResolveView.as_view(), name="redirect-resolve"),
    path("posts/", PostListView.as_view(), name="post-list"),
    path("posts/<slug:slug>/", PostDetailView.as_view(), name="post-detail"),
]
