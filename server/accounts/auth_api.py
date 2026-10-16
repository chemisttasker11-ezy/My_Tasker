"""Authentication HTTP boundary: verified signup, OTP, login, recovery and logout."""
import logging
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, password_validation
from django.core.exceptions import ValidationError
from django.db import transaction, models
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from .models import EmailOTP, UserSessionStamp, VerifiedEmail
from .security import (
    respond_error, payload, email_address, limit, limited_ip, captcha_valid,
    make_email_code, email_code, checked_code,
)
logger = logging.getLogger(__name__)
User = get_user_model()

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
        VerifiedEmail.objects.get_or_create(user=user)
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
        UserSessionStamp.objects.select_for_update().get_or_create(user=user)
        UserSessionStamp.objects.filter(user=user).update(version=models.F("version")+1)
    return JsonResponse({"detail":"Password updated. Log in with your new password."})


@never_cache
@require_GET
def me(request):
    if not request.user.is_authenticated or not request.user.is_active:
        return respond_error("Not authenticated.", 401)
    return JsonResponse({"user": {"id": request.user.pk, "email": request.user.email}})


