"""Shared input, throttling, CAPTCHA and email OTP infrastructure. No endpoints."""
import hashlib
import ipaddress
import json
import logging
import re
import secrets
from datetime import timedelta
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
from django.db import transaction
from django.core.mail import send_mail
from django.http import JsonResponse
from django.utils import timezone
from .models import EmailOTP, RateBucket
import requests

logger = logging.getLogger(__name__)
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


