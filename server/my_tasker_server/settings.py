"""Standalone user-data backend for My Tasker. No ChemistTasker database or sessions."""
import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("SECRET_KEY", "")
DEBUG = os.environ.get("DEBUG", "False").lower() in ("1", "true", "yes")
if not SECRET_KEY or (not DEBUG and len(SECRET_KEY) < 40):
    raise ImproperlyConfigured("Set a strong private SECRET_KEY (40+ characters in production).")
ALLOWED_HOSTS = [s.strip() for s in os.getenv("ALLOWED_HOSTS", "127.0.0.1,localhost" if DEBUG else "").split(",") if s.strip()]
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS must identify the public hostname.")
CSRF_TRUSTED_ORIGINS = [s.strip() for s in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if s.strip()]

INSTALLED_APPS = [
    "django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions",
    "django.contrib.staticfiles", "accounts",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "accounts.middleware.SessionRevocationMiddleware",
]
ROOT_URLCONF = "my_tasker_server.urls"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [],
              "APP_DIRS": True, "OPTIONS": {"context_processors": [
                  "django.template.context_processors.request",
                  "django.contrib.auth.context_processors.auth",
              ]}}]
WSGI_APPLICATION = "my_tasker_server.wsgi.application"
DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL and not DEBUG:
    raise ImproperlyConfigured("Production requires a dedicated DATABASE_URL.")
DATABASES = {"default": dj_database_url.parse(
    DATABASE_URL or f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
    conn_max_age=60, conn_health_checks=True,
)}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
USE_TZ = True
TIME_ZONE = "Australia/Brisbane"
LANGUAGE_CODE = "en-au"
SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_NAME = "mytasker_session"
SESSION_COOKIE_AGE = 7 * 24 * 60 * 60
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_HTTPONLY = False  # Browser sends X-CSRFToken; cookie never carries authentication.
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_SSL_REDIRECT = not DEBUG and os.getenv("FORCE_HTTPS", "True") == "True"
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
if os.getenv("TRUST_PROXY_HEADERS", "False") == "True":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.zoho.com")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True") == "True"
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER)
EMAIL_TIMEOUT = 10
RECAPTCHA_SITE_KEY = os.environ.get("VITE_RECAPTCHA_SITE_KEY", "")
RECAPTCHA_SECRET_KEY = os.environ.get("RECAPTCHA_SECRET_KEY", "")
if not DEBUG:
    if not RECAPTCHA_SITE_KEY or not RECAPTCHA_SECRET_KEY:
        raise ImproperlyConfigured("Production signup requires CAPTCHA site and secret keys.")
    if not EMAIL_HOST_USER or not EMAIL_HOST_PASSWORD or not DEFAULT_FROM_EMAIL:
        raise ImproperlyConfigured("Production email OTP requires SMTP credentials and sender.")

# The app is built as a static SPA, served from the same origin as the API.
WHITENOISE_ROOT = os.environ.get("FRONTEND_DIST", str(BASE_DIR.parent / "dist"))
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Admin authenticator secrets have their own encryption key; never reuse SECRET_KEY.
ADMIN_TOTP_ENCRYPTION_KEY = os.getenv("ADMIN_TOTP_ENCRYPTION_KEY", "")
if not DEBUG and not ADMIN_TOTP_ENCRYPTION_KEY:
    raise ImproperlyConfigured("Production admin login requires ADMIN_TOTP_ENCRYPTION_KEY.")

TRUSTED_PROXY_CIDRS = [value.strip() for value in os.getenv("TRUSTED_PROXY_CIDRS", "").split(",") if value.strip()]

# Isolated container health probe, not a user-authenticated route.
SECURE_REDIRECT_EXEMPT = [r"^healthz/$"]
