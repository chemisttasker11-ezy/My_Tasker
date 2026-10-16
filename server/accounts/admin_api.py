"""Admin-only API. Nothing here reads users' private task content."""
import time
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from .models import AdminAudit, AdminSecurity, UserBoard, UserSessionStamp, VerifiedEmail
from .security import limited_ip, limit, payload, respond_error
from .admin_security import (
    audit_event, authorised_staff, decrypted, encrypted, login_with_mfa,
    new_backup_codes, pending_staff, qr_for_uri, totp_step, accept_otp,
)

User = get_user_model()

def page_number(request):
    try:
        return max(1, min(10000, int(request.GET.get("page","1"))))
    except ValueError:
        return 1

def staff_required(request, *, superuser=False):
    staff = authorised_staff(request, owner=superuser)
    if staff is None:
        return None, respond_error("Admin authenticator verification is required.",403)
    return staff, None

def user_summary(user):
    return {
        "id": user.pk, "email": user.email, "active": user.is_active,
        "staff": user.is_staff, "owner": user.is_superuser,
        "joined": user.date_joined.isoformat(),
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "verified_mfa": AdminSecurity.objects.filter(user=user).exclude(totp_ciphertext="").exists() if user.is_staff else False,
        "email_verified": VerifiedEmail.objects.filter(user=user).exists(),
        # Task contents never leave the owner's private board endpoint.
    }

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

@never_cache
@require_GET
def overview(request):
    staff,error=staff_required(request)
    if error:return error
    since=timezone.now()-timedelta(days=7)
    return JsonResponse({
        "users":{
            "total": User.objects.count(),
            "active": User.objects.filter(is_active=True).count(),
            "pending_verification": User.objects.filter(is_active=False).count(),
            "new_last_7_days": User.objects.filter(date_joined__gte=since).count(),
            "admins": User.objects.filter(is_staff=True,is_active=True).count(),
            "saved_boards": UserBoard.objects.exclude(payload__isnull=True).count(),
        },
        "activity": [{
            "id":event.pk, "action":event.action, "when":event.created_at.isoformat(),
            "actor":event.actor.email if event.actor else "system",
            "subject":event.subject.email if event.subject else None,
        }for event in AdminAudit.objects.select_related("actor","subject")[:12]],
        "permissions":{"can_manage_users":staff.is_superuser}
    })

@never_cache
@require_GET
def users(request):
    staff,error=staff_required(request)
    if error:return error
    search=request.GET.get("q","").strip()[:100]
    queryset=User.objects.all().order_by("-date_joined","-pk")
    if search:
        queryset=queryset.filter(Q(email__icontains=search)|Q(username__icontains=search))
    page=page_number(request); page_size=20
    selected=list(queryset[(page-1)*page_size:page*page_size])
    return JsonResponse({"page":page,"total":queryset.count(),"per_page":page_size,
                         "users":[user_summary(u) for u in selected]})

@csrf_protect
@require_POST
def set_user_status(request,user_id):
    actor,error=staff_required(request,superuser=True)
    if error:return error
    try:
        body=payload(request); enabled=body.get("active")
    except ValueError as exc:return respond_error(str(exc))
    if type(enabled) is not bool:return respond_error("Expected active true or false.")
    with transaction.atomic():
        user=User.objects.select_for_update().filter(pk=user_id).first()
        if not user:return respond_error("User does not exist.",404)
        if user.pk==actor.pk or user.is_superuser:return respond_error("Superuser or self-management is blocked.",403)
        if enabled and not VerifiedEmail.objects.filter(user=user).exists() and not user.is_superuser:
            return respond_error("Account activation requires successful email verification.",409)
        user.is_active=enabled
        user.save(update_fields=["is_active"])
        if not enabled:
            UserSessionStamp.objects.select_for_update().get_or_create(user=user)
            UserSessionStamp.objects.filter(user=user).update(version=F("version")+1)
        audit_event(request,"user.activated" if enabled else "user.suspended",subject=user,actor=actor)
    return JsonResponse({"user":user_summary(user)})

@csrf_protect
@require_POST
def revoke_sessions(request,user_id):
    actor,error=staff_required(request,superuser=True)
    if error:return error
    with transaction.atomic():
        user=User.objects.select_for_update().filter(pk=user_id).first()
        if not user:return respond_error("User does not exist.",404)
        if user.pk==actor.pk:return respond_error("Use logout to end your own admin session.",403)
        UserSessionStamp.objects.select_for_update().get_or_create(user=user)
        UserSessionStamp.objects.filter(user=user).update(version=F("version")+1)
        audit_event(request,"user.sessions_revoked",subject=user,actor=actor)
    return JsonResponse({"detail":"All prior user sessions invalidated."})

@csrf_protect
@require_POST
def set_staff(request,user_id):
    actor,error=staff_required(request,superuser=True)
    if error:return error
    try:
        body=payload(request); staff=body.get("staff")
    except ValueError as exc:return respond_error(str(exc))
    if type(staff) is not bool:return respond_error("Expected staff true or false.")
    with transaction.atomic():
        user=User.objects.select_for_update().filter(pk=user_id).first()
        if not user:return respond_error("User does not exist.",404)
        if user.pk==actor.pk or user.is_superuser or not user.is_active or not VerifiedEmail.objects.filter(user=user).exists():
            return respond_error("Cannot change self, superusers or inactive accounts.",403)
        user.is_staff=staff
        user.save(update_fields=["is_staff"])
        UserSessionStamp.objects.select_for_update().get_or_create(user=user)
        UserSessionStamp.objects.filter(user=user).update(version=F("version")+1)
        if staff:
            # New staff must enroll a personal authenticator before any privileged access.
            security,_=AdminSecurity.objects.get_or_create(user=user)
            security.totp_ciphertext=""
            security.pending_ciphertext=""
            security.pending_created_at=None
            security.last_accepted_step=-1
            security.backup_hashes=[]
            security.save()
        audit_event(request,"user.staff_granted" if staff else "user.staff_revoked",subject=user,actor=actor)
    return JsonResponse({"user":user_summary(user)})

@never_cache
@require_GET
def audit(request):
    staff,error=staff_required(request)
    if error:return error
    page=page_number(request);limit_rows=25
    action=request.GET.get("action","").strip()[:64]
    queryset=AdminAudit.objects.select_related("actor","subject")
    if action:queryset=queryset.filter(action=action)
    selected=queryset[(page-1)*limit_rows:page*limit_rows]
    return JsonResponse({"page":page,"total":queryset.count(),"per_page":limit_rows,"events":[{
        "id":evt.pk,"when":evt.created_at.isoformat(),"action":evt.action,
        "actor":evt.actor.email if evt.actor else "system",
        "subject":evt.subject.email if evt.subject else None,
        "metadata":evt.metadata
    }for evt in selected]})

@never_cache
@require_GET
def health(request):
    staff,error=staff_required(request)
    if error:return error
    return JsonResponse({
        "smtp_configured":bool(settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD),
        "captcha_configured":bool(settings.RECAPTCHA_SECRET_KEY and settings.RECAPTCHA_SITE_KEY),
        "authenticator_required":True,
        "session_window_hours":12,
        "https_required":not settings.DEBUG,
        "environment":"development" if settings.DEBUG else "production",
        "board_storage":"PostgreSQL" if settings.DATABASES["default"]["ENGINE"].endswith("postgresql") else "SQLite (development)"
    })
