"""Shared staff permission policy, safe user summaries and pagination."""
from django.contrib.auth import get_user_model
from .models import AdminSecurity, VerifiedEmail
from .security import respond_error
from .admin_security import authorised_staff

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

