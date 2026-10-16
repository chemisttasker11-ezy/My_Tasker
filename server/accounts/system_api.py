"""Public health/config + same-origin frontend entrypoint. No user data here."""
from pathlib import Path
from django.conf import settings
from django.http import FileResponse, HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

@never_cache
@require_GET
def healthz(request):
    return JsonResponse({"status": "ok"})


@never_cache
@require_GET
def config(request):
    return JsonResponse({"captcha_site_key": settings.RECAPTCHA_SITE_KEY})


@never_cache
@ensure_csrf_cookie
@require_GET
def csrf(request):
    return JsonResponse({"csrf_token": get_token(request)})


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
