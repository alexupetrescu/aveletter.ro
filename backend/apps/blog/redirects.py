from urllib.parse import unquote, urlsplit

from django.core.exceptions import ValidationError

from .models import SlugRedirect


def validate_redirect_path(value):
    """Redirects managed in the CRM stay on this site and outside private routes."""
    decoded = unquote(value)
    parts = urlsplit(decoded)
    if (
        not value.startswith("/") or decoded.startswith("//")
        or parts.scheme or parts.netloc or parts.query or parts.fragment
        or "\\" in decoded or any(ord(c) < 32 for c in decoded)
        or any(segment in (".", "..") for segment in parts.path.split("/"))
        or parts.path.split("/")[1] in ("api", "crm", "admin", "cart", "checkout", "_next", "media")
    ):
        raise ValidationError("Folosește o cale publică locală, fără domeniu, parametri sau fragment.")
    return value


def resolve_redirect(path):
    """Collapse chains to one hop; ignore malformed legacy records and loops."""
    visited = set()
    current = path.rstrip("/") or "/"
    for _ in range(20):
        try:
            validate_redirect_path(current)
        except (ValidationError, ValueError):
            return None
        if current in visited:
            return None
        visited.add(current)
        target = (
            SlugRedirect.objects.filter(old_path__in=[current, current + "/"])
            .order_by("old_path").values_list("new_path", flat=True).first()
        )
        if not target:
            return current if len(visited) > 1 else None
        current = target.rstrip("/") or "/"
    return None
