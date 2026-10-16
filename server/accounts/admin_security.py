"""Strict authenticator-app MFA primitives for staff access.

No session carries admin authority until a password AND a fresh TOTP (or one
single-use backup code) have both succeeded.  TOTP secrets are Fernet-encrypted
under a dedicated, non-repository key; backups use keyed digests.
"""
import base64
import hashlib
import hmac
import io
import secrets
import time
from datetime import timedelta
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.contrib.auth import login
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone
from django.contrib.auth import get_user_model
from .models import AdminAudit, AdminSecurity, UserSessionStamp
from .views import request_ip

User = get_user_model()
MFA_SESSION_SECONDS = 12 * 60 * 60
PENDING_SECONDS = 5 * 60
WINDOW_STEPS = 1
BACKUP_COUNT = 8

def cipher():
    key = getattr(settings, "ADMIN_TOTP_ENCRYPTION_KEY", "")
    if not key:
        raise ImproperlyConfigured("Admin TOTP encryption key is missing.")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise ImproperlyConfigured("Invalid ADMIN_TOTP_ENCRYPTION_KEY format.") from exc

def encrypted(secret):
    return cipher().encrypt(secret.encode("ascii")).decode("ascii")

def decrypted(token):
    try:
        return cipher().decrypt(token.encode("ascii")).decode("ascii")
    except (InvalidToken, ValueError) as exc:
        raise ImproperlyConfigured("Admin authenticator secret cannot be decrypted.") from exc

def pending_staff(request):
    uid = request.session.get("admin_pending_uid")
    at = request.session.get("admin_pending_at")
    if type(uid) is not int or not isinstance(at, (float, int)) or time.time() - at > PENDING_SECONDS:
        return None
    return User.objects.filter(pk=uid, is_staff=True, is_active=True).first()

def authorised_staff(request, owner=False):
    user = request.user
    if not user.is_authenticated or not user.is_active or not user.is_staff:
        return None
    if owner and not user.is_superuser:
        return None
    if request.session.get("admin_mfa_user_id") != user.pk:
        return None
    at = request.session.get("admin_mfa_at")
    if not isinstance(at,(float,int)) or time.time() - at > MFA_SESSION_SECONDS:
        return None
    if not AdminSecurity.objects.filter(user=user).exclude(totp_ciphertext="").exists():
        return None
    return user

def totp_step(secret, code, last_step=-1):
    import pyotp
    if not isinstance(code,str) or len(code) != 6 or not code.isdigit():
        return None
    totp = pyotp.TOTP(secret, digits=6, interval=30)
    now = int(time.time() // 30)
    for step in (now-1, now, now+1):
        if step > last_step and secrets.compare_digest(totp.at(step*30), code):
            return step
    return None

def backup_digest(raw):
    return hmac.new(settings.SECRET_KEY.encode("utf-8"),
                    raw.strip().upper().encode("utf-8"), hashlib.sha256).hexdigest()

def new_backup_codes():
    codes = [f"{secrets.token_hex(4).upper()}-{secrets.token_hex(4).upper()}" for _ in range(BACKUP_COUNT)]
    return codes, [backup_digest(code) for code in codes]

def accept_otp(record, code):
    if not record.totp_ciphertext:
        return False
    step = totp_step(decrypted(record.totp_ciphertext), code, record.last_accepted_step)
    if step is not None:
        record.last_accepted_step = step
        record.save(update_fields=["last_accepted_step"])
        return True
    if isinstance(code, str):
        matched = backup_digest(code)
        for pos, digest in enumerate(record.backup_hashes):
            if hmac.compare_digest(matched, digest):
                record.backup_hashes = [x for i,x in enumerate(record.backup_hashes) if i!=pos]
                record.save(update_fields=["backup_hashes"])
                return True
    return False

def login_with_mfa(request, user):
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    stamp, _ = UserSessionStamp.objects.get_or_create(user=user)
    request.session["session_version"] = stamp.version
    request.session["admin_mfa_user_id"] = user.pk
    request.session["admin_mfa_at"] = time.time()
    request.session.set_expiry(MFA_SESSION_SECONDS)

def qr_for_uri(uri):
    import qrcode
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M,
                       box_size=6, border=3)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#072d71", back_color="#ffffff")
    stream = io.BytesIO()
    img.save(stream, format="PNG")
    return "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode("ascii")

def audit_event(request, action, subject=None, metadata=None, actor=None):
    user = actor or request.user
    AdminAudit.objects.create(
        actor=user if getattr(user, "is_authenticated", False) else None,
        subject=subject, action=action, metadata=metadata or {},
        ip_hash=hashlib.sha256(("ip:" + request_ip(request)).encode("utf-8")).hexdigest()
    )
