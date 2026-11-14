"""Runtime-only production settings shared by the three captured Django apps."""

import importlib
import os

PROJECT=os.environ["RUNTIME_PROJECT"]
if PROJECT not in {"avestudio","aveletter","lunador"}:raise RuntimeError("Unknown application")
_base=importlib.import_module("backend.settings" if PROJECT=="avestudio" else "config.settings")
globals().update({name:getattr(_base,name) for name in dir(_base) if name.isupper()})
PRIMARY_HOST=PROJECT+".ro"
DEBUG=False
if len(SECRET_KEY)<50 or SECRET_KEY.startswith("django-insecure"):raise RuntimeError("A strong private Django key is required")
ALLOWED_HOSTS=[PRIMARY_HOST,"www."+PRIMARY_HOST,"backend","localhost","127.0.0.1"]
if PROJECT=="avestudio":ALLOWED_HOSTS += ["api.avestudio.ro","admin.avestudio.ro"]
FRONTEND_URL="https://"+PRIMARY_HOST
PUBLIC_SITE_URL=FRONTEND_URL
CSRF_TRUSTED_ORIGINS=[FRONTEND_URL,"https://www."+PRIMARY_HOST]
CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=CSRF_TRUSTED_ORIGINS
SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO","https")
USE_X_FORWARDED_HOST=False
SECURE_SSL_REDIRECT=True
SECURE_REDIRECT_EXEMPT=[r"^api/health/$"]
SECURE_HSTS_SECONDS=3600
SECURE_HSTS_INCLUDE_SUBDOMAINS=False
SECURE_HSTS_PRELOAD=False
SILENCED_SYSTEM_CHECKS=[*globals().get("SILENCED_SYSTEM_CHECKS",[]),"security.W005","security.W021"]
SECURE_CONTENT_TYPE_NOSNIFF=True
SECURE_REFERRER_POLICY="same-origin"
SESSION_COOKIE_SECURE=True
SESSION_COOKIE_HTTPONLY=True
SESSION_COOKIE_SAMESITE="Lax"
CSRF_COOKIE_SECURE=True
CSRF_COOKIE_SAMESITE="Lax"
X_FRAME_OPTIONS="DENY"
RUNTIME_EMAIL_ENABLED=os.environ.get("RUNTIME_EMAIL_ENABLED")=="1"
RUNTIME_BILLING_ENABLED=os.environ.get("RUNTIME_BILLING_ENABLED")=="1"
RUNTIME_DRIVE_ENABLED=os.environ.get("RUNTIME_DRIVE_ENABLED")=="1"
if not RUNTIME_EMAIL_ENABLED:
    EMAIL_BACKEND="django.core.mail.backends.dummy.EmailBackend"
    EMAIL_HOST_PASSWORD=""
if not RUNTIME_BILLING_ENABLED:
    STRIPE_SECRET_KEY=STRIPE_WEBHOOK_SECRET=STRIPE_PUBLISHABLE_KEY=""
if not RUNTIME_DRIVE_ENABLED:
    GOOGLE_DRIVE_CREDENTIALS_PATH=GOOGLE_DRIVE_API_KEY=""
MIDDLEWARE=["production_middleware.InternalProxyMiddleware",*MIDDLEWARE]
MIDDLEWARE.insert(MIDDLEWARE.index("django.contrib.auth.middleware.AuthenticationMiddleware")+1,"production_middleware.RuntimeMiddleware")
ROOT_URLCONF="production_urls"

