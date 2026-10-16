"""Admin's MFA challenge and enrollment boundary; no task/user management."""
from datetime import timedelta
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from .models import AdminSecurity
from .security import limited_ip, limit, payload, respond_error
from .admin_security import (
    audit_event, authorised_staff, decrypted, encrypted, login_with_mfa,
    new_backup_codes, pending_staff, qr_for_uri, totp_step, accept_otp,
)
@never_cache
@require_GET
def status(request):
    staff=authorised_staff(request)
    if staff:
        return JsonResponse({"stage":"ready","user":{"email":staff.email,"id":staff.pk,"owner":staff.is_superuser}})
    candidate=pending_staff(request)
    if candidate:
        enrolled = AdminSecurity.objects.filter(user=candidate).exclude(totp_ciphertext="").exists()
        return JsonResponse({"stage":"challenge" if enrolled else "enroll","user":{"email":candidate.email}})
    return JsonResponse({"stage":"login"})

@csrf_protect
@require_POST
def enroll(request):
    candidate=pending_staff(request)
    if not candidate:
        return respond_error("Password verification has expired. Log in again.",401)
    if not limited_ip(request,"admin-enroll-ip",8,900):
        return respond_error("Too many attempts. Try again later.",429)
    import pyotp
    with transaction.atomic():
        record,_=AdminSecurity.objects.select_for_update().get_or_create(user=candidate)
        if record.totp_ciphertext:
            return respond_error("An authenticator is already registered.",409)
        secret=pyotp.random_base32()
        record.pending_ciphertext=encrypted(secret)
        record.pending_created_at=timezone.now()
        record.save(update_fields=["pending_ciphertext","pending_created_at"])
    uri=pyotp.TOTP(secret).provisioning_uri(name=candidate.email,issuer_name="My Tasker")
    return JsonResponse({"uri":uri,"secret":secret,"qr":qr_for_uri(uri),
                         "expires_in_seconds":600})

@csrf_protect
@require_POST
def verify_admin(request):
    candidate=pending_staff(request)
    if not candidate:
        return respond_error("Password verification has expired. Log in again.",401)
    if not limited_ip(request,"admin-verify-ip",18,900) or not limit("admin-verify-user",candidate.pk,10,900):
        return respond_error("Too many attempts. Try again later.",429)
    try:
        code=payload(request).get("code")
    except ValueError as exc:
        return respond_error(str(exc))
    if not isinstance(code,str) or len(code)>60:
        return respond_error("Invalid authenticator code.")
    codes=None
    with transaction.atomic():
        record,_=AdminSecurity.objects.select_for_update().get_or_create(user=candidate)
        if record.totp_ciphertext:
            if not accept_otp(record,code):
                return respond_error("Invalid authenticator or backup code.",401)
        else:
            if not record.pending_ciphertext or not record.pending_created_at:
                return respond_error("Start authenticator setup again.",400)
            if timezone.now() - record.pending_created_at > timedelta(minutes=10):
                return respond_error("Authenticator setup expired. Start again.",400)
            secret=decrypted(record.pending_ciphertext)
            step=totp_step(secret,code)
            if step is None:
                return respond_error("Invalid authenticator code.",401)
            codes, backup_hashes=new_backup_codes()
            record.totp_ciphertext=record.pending_ciphertext
            record.pending_ciphertext=""
            record.pending_created_at=None
            record.last_accepted_step=step
            record.backup_hashes=backup_hashes
            record.save(update_fields=[
                "totp_ciphertext","pending_ciphertext","pending_created_at",
                "last_accepted_step","backup_hashes"
            ])
    login_with_mfa(request,candidate)
    audit_event(request,"admin.mfa_login",subject=candidate,actor=candidate,
                metadata={"method":"authenticator" if codes is None else "enrollment"})
    data={"user":{"id":candidate.pk,"email":candidate.email,"owner":candidate.is_superuser}}
    if codes:
        # Deliberately returned only once; no endpoint can retrieve backup codes.
        data["backup_codes"]=codes
    return JsonResponse(data)

