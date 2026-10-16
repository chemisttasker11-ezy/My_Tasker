"""Read-only admin reports and health: no private board payloads leave this API."""
from datetime import timedelta
from django.conf import settings
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET
from .models import AdminAudit, UserBoard
from .admin_common import User, page_number, staff_required, user_summary
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
