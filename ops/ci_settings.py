"""Disposable CI PostgreSQL only; never imported by production Compose."""
import importlib
import os

assert os.environ.get("CI_DATABASE_HOST") == "ci-db"
project = os.environ["RUNTIME_PROJECT"]
os.environ["DATABASE_URL"] = "postgresql://ci:disposable-ci-only@ci-db:5432/ci"
if project == "avestudio":
    os.environ["RUNTIME_INTERNAL_CIDR"] = os.environ.get("CI_HTTP_SUBNET", "172.30.20.0/24")
base = importlib.import_module("production_settings" if project == "avestudio" else "config.settings")
globals().update({name: getattr(base, name) for name in dir(base) if name.isupper()})
SECRET_KEY = "ci-only-disposable-key-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ"
DEBUG = False
DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql", "HOST": "ci-db", "PORT": 5432,
                         "NAME": "ci", "USER": "ci", "PASSWORD": "disposable-ci-only"}}
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
EMAIL_HOST_PASSWORD = ""
STRIPE_SECRET_KEY = STRIPE_WEBHOOK_SECRET = STRIPE_PUBLISHABLE_KEY = ""
GOOGLE_DRIVE_CREDENTIALS_PATH = GOOGLE_DRIVE_API_KEY = ""
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1", "backend"]
MEDIA_ROOT = "/tmp/ci-media"
STATIC_ROOT = "/tmp/ci-static"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
SECURE_SSL_REDIRECT = SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = False
SECURE_HSTS_SECONDS = 0
if project == "avestudio":
    # Exercise the same private-photo middleware as production with synthetic rows.
    PROJECT = project
    PRIMARY_HOST = "avestudio.ro"
    ALLOWED_HOSTS += [PRIMARY_HOST, "www." + PRIMARY_HOST]
    RUNTIME_EMAIL_ENABLED = RUNTIME_BILLING_ENABLED = RUNTIME_DRIVE_ENABLED = False
    SECURE_SSL_REDIRECT = SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True
    ROOT_URLCONF = "production_urls"
