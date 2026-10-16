"""First-party auth, verified email, and private revision-guarded task storage.

Standalone service: no dependency on ChemistTasker accounts or privileged secrets.
Mutations use same-origin CSRF-protected session cookies.
"""
import hashlib
import ipaddress
import json
import logging
import re
import secrets
from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, password_validation
from django.contrib.auth.hashers import make_password, check_password
from django.db import transaction
from django.core.mail import send_mail
from django.core.exceptions import ValidationError
from django.http import FileResponse, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_protect
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from django.middleware.csrf import get_token
from .models import EmailOTP, RateBucket, UserBoard, UserSessionStamp
import requests

logger = logging.getLogger(__name__)
User = get_user_model()
MAX_BOARD_BYTES = 4 * 1024 * 1024


def respond_error(detail, status=400):
    return JsonResponse({"detail": detail}, status=status)


def payload(request):
    if len(request.body) > MAX_BOARD_BYTES + 5000:
        raise ValueError("Request is too large.")
    try:
        raw = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        raise ValueError("Invalid JSON.")
    if not isinstance(raw, dict):
        raise ValueError("Expected a JSON object.")
    return raw


def email_address(raw):
    value = str(raw or "").strip().lower()
    if not re.fullmatch(r"[^\s@]{1,64}@[^\s@]{1,190}", value):
        raise ValueError("Enter a valid email address.")
    return value[:254]


def limit(scope, identifier, maximum, seconds):
    """Database-backed per-actor throttle; survives multiworker restarts."""
    key = hashlib.sha256((scope + ":" + str(identifier)).encode("utf-8")).hexdigest()
    now = timezone.now()
    with transaction.atomic():
        bucket, _ = RateBucket.objects.select_for_update().get_or_create(
            key=key, defaults={"window_start": now, "count": 0})
        if now >= bucket.window_start + timedelta(seconds=seconds):
            bucket.window_start = now
            bucket.count = 0
        if bucket.count >= maximum:
            return False
        bucket.count += 1
        bucket.save(update_fields=["window_start", "count"])
    return True


def request_ip(request):
    """Trust X-Real-IP only when REMOTE_ADDR matches a configured reverse proxy."""
    remote = request.META.get("REMOTE_ADDR", "")
    try:
        actual = ipaddress.ip_address(remote)
        trusted = any(actual in ipaddress.ip_network(cidr, strict=False)
                      for cidr in settings.TRUSTED_PROXY_CIDRS)
        if trusted:
            forwarded = request.META.get("HTTP_X_REAL_IP", "")
            return str(ipaddress.ip_address(forwarded))
        return str(actual)
    except ValueError:
        return remote or "unknown"


def limited_ip(request, action, maximum, seconds):
    return limit(action, request_ip(request), maximum, seconds)


def captcha_valid(token, request):
    if not isinstance(token, str) or not token or len(token) > 4096:
        return False
    if not settings.RECAPTCHA_SECRET_KEY:
        return False
    try:
        reply = requests.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={"secret": settings.RECAPTCHA_SECRET_KEY, "response": token},
            timeout=5)
        reply.raise_for_status()
        result = reply.json()
        if result.get("success") is not True:
            return False
        # A token valid on another domain cannot create accounts on this site.
        hostname = str(result.get("hostname", "")).lower()
        if not settings.DEBUG and hostname != request.get_host().split(":")[0].lower():
            return False
        return True
    except (requests.RequestException, ValueError, AttributeError):
        logger.warning("CAPTCHA verification unavailable or rejected.")
        return False


def make_email_code(user, purpose):
    value = f"{secrets.randbelow(900000) + 100000}"
    now = timezone.now()
    EmailOTP.objects.update_or_create(
        user=user, defaults={
            "code_hash": make_password(value), "sent_at": now,
            "expires_at": now + timedelta(minutes=10), "failed_attempts": 0,
            "locked_until": None, "purpose": purpose,
        })
    return value


def email_code(user, code, purpose):
    # No OTP is exposed in logs, API responses, or persisted as plaintext.
    subject = "My Tasker - verify your email" if purpose == "verify" else "My Tasker - password reset code"
    message = (
        "Your My Tasker verification code is " + code +
        ".\nIt expires in 10 minutes.\n\nIf you did not request this, ignore this message."
    )
    send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email],
              fail_silently=False)


def checked_code(user, raw, purpose):
    """Return (ok, code record); must be called under transaction.atomic."""
    try:
        record = EmailOTP.objects.select_for_update().get(user=user, purpose=purpose)
    except EmailOTP.DoesNotExist:
        return False, None
    now = timezone.now()
    if record.locked_until and now < record.locked_until:
        return False, None
    if record.expires_at < now or not isinstance(raw, str) or not re.fullmatch(r"\d{6}", raw):
        return False, None
    if not check_password(raw, record.code_hash):
        record.failed_attempts += 1
        if record.failed_attempts >= 5:
            record.locked_until = now + timedelta(minutes=15)
        record.save(update_fields=["failed_attempts", "locked_until"])
        return False, None
    return True, record


@never_cache
@require_GET
def config(request):
    return JsonResponse({"captcha_site_key": settings.RECAPTCHA_SITE_KEY})


@never_cache
@ensure_csrf_cookie
@require_GET
def csrf(request):
    return JsonResponse({"csrf_token": get_token(request)})


@csrf_protect
@require_POST
def signup(request):
    if not limited_ip(request, "signup-ip", 8, 3600):
        return respond_error("Too many attempts. Please try again later.", 429)
    try:
        data = payload(request)
        email = email_address(data.get("email"))
        password = data.get("password")
        if not isinstance(password, str) or len(password) > 200:
            return respond_error("Choose a strong password (12 characters or more).")
        password_validation.validate_password(password)
    except (ValueError, ValidationError) as exc:
        messages = exc.messages if isinstance(exc, ValidationError) else [str(exc)]
        return respond_error(" ".join(messages))
    if not limit("signup-email", email, 4, 3600):
        return respond_error("Too many attempts. Please try again later.", 429)
    if not captcha_valid(data.get("captcha_token"), request):
        return respond_error("CAPTCHA validation failed. Please try again.")
    if User.objects.filter(username=email).exists():
        return respond_error("This email already has an account. Log in or request a new verification code.", 409)
    try:
        with transaction.atomic():
            user = User.objects.create_user(username=email, email=email, password=password, is_active=False)
            code = make_email_code(user, "verify")
            email_code(user, code, "verify")
    except Exception as exc:
        # Unique username races or delivery failures must not create an active account.
        logger.warning("Signup failed to complete: %s", type(exc).__name__)
        return respond_error("Unable to create an account right now. Please try again later.", 503)
    return JsonResponse({"detail": "Check your email for the six-digit code."}, status=201)


@csrf_protect
@require_POST
def verify_otp(request):
    if not limited_ip(request, "verify-ip", 30, 900):
        return respond_error("Too many attempts. Please try again later.", 429)
    try:
        data = payload(request)
        email = email_address(data.get("email"))
    except ValueError as exc:
        return respond_error(str(exc))
    if not limit("verify-email", email, 10, 900):
        return respond_error("Too many attempts. Please try again later.", 429)
    with transaction.atomic():
        user = User.objects.select_for_update().filter(username=email, is_active=False).first()
        if user is None:
            return respond_error("Invalid or expired verification code.")
        ok, record = checked_code(user, data.get("otp"), "verify")
        if not ok or record is None:
            return respond_error("Invalid or expired verification code.")
        user.is_active = True
        user.save(update_fields=["is_active"])
        record.delete()
    return JsonResponse({"detail": "Email verified. You can now log in."})


@csrf_protect
@require_POST
def resend_otp(request):
    if not limited_ip(request, "resend-ip", 10, 3600):
        return respond_error("Too many requests. Try again later.", 429)
    try:
        email = email_address(payload(request).get("email"))
    except ValueError as exc:
        return respond_error(str(exc))
    if not limit("resend-email", email, 4, 3600):
        return respond_error("Too many requests. Try again later.", 429)
    user = User.objects.filter(username=email, is_active=False).first()
    if user is not None:
        try:
            with transaction.atomic():
                previous = EmailOTP.objects.select_for_update().filter(user=user).first()
                if previous and previous.sent_at > timezone.now() - timedelta(seconds=60):
                    return respond_error("Please allow 60 seconds between codes.", 429)
                code = make_email_code(user, "verify")
                email_code(user, code, "verify")
        except Exception as exc:
            logger.warning("OTP delivery unavailable (%s).", type(exc).__name__)
            return respond_error("Could not send a code right now.", 503)
    return JsonResponse({"detail": "If an unverified account exists, a new code has been sent."})


@csrf_protect
@require_POST
def signin(request):
    if not limited_ip(request, "login-ip", 20, 900):
        return respond_error("Too many login attempts. Try again later.", 429)
    try:
        data = payload(request)
        email = email_address(data.get("email"))
        password = data.get("password")
    except ValueError:
        return respond_error("Invalid email or password.", 401)
    if not limit("login-email", email, 12, 900):
        return respond_error("Too many login attempts. Try again later.", 429)
    if not isinstance(password, str):
        return respond_error("Invalid email or password.", 401)
    user = authenticate(request, username=email, password=password)
    if not user or not user.is_active:
        return respond_error("Invalid email, password or unverified account.", 401)
    if user.is_staff:
        if not settings.ADMIN_TOTP_ENCRYPTION_KEY:
            return respond_error("Admin two-factor authentication is not configured.", 503)
        request.session.flush()
        request.session["admin_pending_uid"] = user.pk
        request.session["admin_pending_at"] = timezone.now().timestamp()
        from .models import AdminSecurity
        enrolled = AdminSecurity.objects.filter(user=user).exclude(totp_ciphertext="").exists()
        return JsonResponse({"admin_challenge": True, "enrolled": enrolled}, status=202)
    login(request, user)
    stamp, _ = UserSessionStamp.objects.get_or_create(user=user)
    request.session["session_version"] = stamp.version
    return JsonResponse({"user": {"id": user.pk, "email": user.email}})


@csrf_protect
@require_POST
def signout(request):
    logout(request)
    return JsonResponse({"detail": "Signed out."})


@csrf_protect
@require_POST
def request_reset(request):
    """Email one recovery code without revealing whether an account exists."""
    if not limited_ip(request, "reset-request-ip", 8, 3600):
        return respond_error("Too many requests. Try again later.", 429)
    try:
        email = email_address(payload(request).get("email"))
    except ValueError as exc:
        return respond_error(str(exc))
    if not limit("reset-request-email", email, 4, 3600):
        return respond_error("Too many requests. Try again later.", 429)
    user = User.objects.filter(username=email, is_active=True).first()
    if user:
        try:
            with transaction.atomic():
                earlier = EmailOTP.objects.select_for_update().filter(user=user).first()
                if earlier and earlier.sent_at > timezone.now() - timedelta(seconds=60):
                    return respond_error("Please wait before requesting another code.", 429)
                email_code(user, make_email_code(user, "reset"), "reset")
        except Exception as exc:
            logger.warning("Reset mail delivery unavailable (%s).", type(exc).__name__)
            return respond_error("Unable to send email right now.", 503)
    return JsonResponse({"detail":"If an account exists, a recovery code has been sent."})


@csrf_protect
@require_POST
def reset_password(request):
    if not limited_ip(request, "reset-verify-ip", 20, 900):
        return respond_error("Too many attempts. Try again later.", 429)
    try:
        data = payload(request)
        email = email_address(data.get("email"))
        next_password = data.get("password")
        if not isinstance(next_password,str) or len(next_password)>200:
            return respond_error("Choose a strong password.")
        password_validation.validate_password(next_password)
    except (ValueError, ValidationError) as exc:
        messages = exc.messages if isinstance(exc,ValidationError) else [str(exc)]
        return respond_error(" ".join(messages))
    if not limit("reset-verify-email", email, 10, 900):
        return respond_error("Too many attempts. Try again later.", 429)
    with transaction.atomic():
        user = User.objects.select_for_update().filter(username=email,is_active=True).first()
        if user is None:
            return respond_error("Invalid or expired recovery code.")
        valid, token = checked_code(user, data.get("otp"), "reset")
        if not valid or token is None:
            return respond_error("Invalid or expired recovery code.")
        user.set_password(next_password)
        user.save(update_fields=["password"])
        token.delete()
    return JsonResponse({"detail":"Password updated. Log in with your new password."})


@never_cache
@require_GET
def me(request):
    if not request.user.is_authenticated or not request.user.is_active:
        return respond_error("Not authenticated.", 401)
    return JsonResponse({"user": {"id": request.user.pk, "email": request.user.email}})


@csrf_protect
@require_http_methods(["GET", "PUT"])
def board(request):
    if not request.user.is_authenticated or not request.user.is_active:
        return respond_error("Not authenticated.", 401)
    if request.method == "GET":
        record, _ = UserBoard.objects.get_or_create(user=request.user)
        return JsonResponse({"board": record.payload, "revision": record.revision})
    try:
        data = payload(request)
    except ValueError as exc:
        return respond_error(str(exc))
    revision = data.get("revision")
    saved = data.get("board")
    if type(revision) is not int or revision < 0 or revision > 2147483647:
        return respond_error("Invalid revision.")
    if not isinstance(saved, dict) or saved.get("version") != 1 or not isinstance(saved.get("tasks"), list) or not isinstance(saved.get("completions"), list):
        return respond_error("Invalid board backup.")
    if len(saved["tasks"]) > 10000 or len(saved["completions"]) > 50000:
        return respond_error("Board size limit exceeded.")
    if len(json.dumps(saved).encode("utf-8")) > MAX_BOARD_BYTES:
        return respond_error("Board is too large.", 413)
    with transaction.atomic():
        record, _ = UserBoard.objects.select_for_update().get_or_create(user=request.user)
        if record.revision != revision:
            return JsonResponse({"detail": "Another session changed this board. Export your local edits before reloading.",
                                 "revision": record.revision}, status=409)
        record.payload = saved
        record.revision += 1
        record.save(update_fields=["payload", "revision", "updated_at"])
    return JsonResponse({"revision": record.revision})


@csrf_protect
@require_http_methods(["DELETE"])
def delete_account(request):
    if not request.user.is_authenticated:
        return respond_error("Not authenticated.", 401)
    try:
        password = payload(request).get("password")
    except ValueError as exc:
        return respond_error(str(exc))
    if not isinstance(password,str) or not request.user.check_password(password):
        return respond_error("Password confirmation failed.", 400)
    user = request.user
    logout(request)
    user.delete()
    return JsonResponse({"detail": "Account and its saved board deleted."})


@never_cache
@require_GET
def index(request):
    root = Path(settings.WHITENOISE_ROOT)
    document = root / "index.html"
    if not document.is_file():
        return HttpResponse("Frontend not built. Run Vite for local development.", status=503)
    response = FileResponse(document.open("rb"), content_type="text/html")
    response["Cache-Control"] = "no-store"
    return response
