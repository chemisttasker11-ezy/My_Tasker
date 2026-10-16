"""Privileged account status, staff role and session management, all audited."""
from django.db import transaction
from django.db.models import F
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST
from .models import AdminSecurity, UserSessionStamp, VerifiedEmail
from .security import payload, respond_error
from .admin_security import audit_event
from .admin_common import User, staff_required, user_summary
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

