from django.contrib.auth import logout
from django.http import JsonResponse
from .models import UserSessionStamp

class SessionRevocationMiddleware:
    """Invalidate old sessions without scanning the session database."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            stamp, _ = UserSessionStamp.objects.get_or_create(user=request.user)
            if request.session.get("session_version") != stamp.version:
                logout(request)
                # The backend's authenticated user is no longer trusted for this request.
                return JsonResponse({"detail": "Your session was revoked. Please log in again."}, status=401)
        return self.get_response(request)
