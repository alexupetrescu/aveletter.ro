from urllib.parse import urlparse

from django.conf import settings

from apps.site_config.models import SiteConfig


def _normalize_base(url: str) -> str:
    return (url or "").strip().rstrip("/")


def _is_localhost(url: str) -> bool:
    host = urlparse(url).hostname or ""
    return host in ("localhost", "127.0.0.1") or host.endswith(".localhost")


def _is_allowed_origin(origin: str) -> bool:
    origin = _normalize_base(origin)
    if not origin:
        return False
    if _is_localhost(origin):
        return True
    allowed = getattr(settings, "CORS_ALLOWED_ORIGINS", []) or []
    if origin in allowed:
        return True
    site_domain = (SiteConfig.get_solo().domain or "").strip()
    if not site_domain:
        return False
    clean = (
        site_domain.removeprefix("https://")
        .removeprefix("http://")
        .split("/")[0]
        .lower()
    )
    host = (urlparse(origin).hostname or "").lower()
    return host == clean or host.endswith(f".{clean}")


def _url_from_site_domain() -> str | None:
    domain = (SiteConfig.get_solo().domain or "").strip()
    if not domain:
        return None
    domain = domain.removeprefix("https://").removeprefix("http://").strip("/")
    return f"https://{domain}"


def resolve_frontend_url(request=None) -> str:
    """
    Base URL for the public Next.js site (Stripe redirects, email links).

    Priority: explicit FRONTEND_URL env (if not localhost) → request Origin →
    SiteConfig.domain → FRONTEND_URL default (dev localhost).
    """
    configured = _normalize_base(getattr(settings, "FRONTEND_URL", ""))

    if configured and not _is_localhost(configured):
        return configured

    if request is not None:
        origin = _normalize_base(request.META.get("HTTP_ORIGIN", ""))
        if origin and _is_allowed_origin(origin):
            return origin

    from_domain = _url_from_site_domain()
    if from_domain:
        return from_domain

    return configured or "http://localhost:3020"
