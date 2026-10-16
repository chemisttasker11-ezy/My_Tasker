"""Private task-board storage and account deletion, separate from login semantics."""
import json
from django.contrib.auth import logout
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods
from .models import UserBoard
from .security import respond_error, payload, MAX_BOARD_BYTES

@csrf_protect
@require_http_methods(["GET", "PUT"])
def board(request):
    if not request.user.is_authenticated or not request.user.is_active:
        return respond_error("Not authenticated.", 401)
    if request.method == "GET":
        record, _ = UserBoard.objects.get_or_create(user=request.user)
        return JsonResponse({"board": record.payload, "revision": record.revision})
    try:
        data = payload(request)
    except ValueError as exc:
        return respond_error(str(exc))
    revision = data.get("revision")
    saved = data.get("board")
    if type(revision) is not int or revision < 0 or revision > 2147483647:
        return respond_error("Invalid revision.")
    if not isinstance(saved, dict) or saved.get("version") != 1 or not isinstance(saved.get("tasks"), list) or not isinstance(saved.get("completions"), list):
        return respond_error("Invalid board backup.")
    if len(saved["tasks"]) > 10000 or len(saved["completions"]) > 50000:
        return respond_error("Board size limit exceeded.")
    if len(json.dumps(saved).encode("utf-8")) > MAX_BOARD_BYTES:
        return respond_error("Board is too large.", 413)
    with transaction.atomic():
        record, _ = UserBoard.objects.select_for_update().get_or_create(user=request.user)
        if record.revision != revision:
            return JsonResponse({"detail": "Another session changed this board. Export your local edits before reloading.",
                                 "revision": record.revision}, status=409)
        record.payload = saved
        record.revision += 1
        record.save(update_fields=["payload", "revision", "updated_at"])
    return JsonResponse({"revision": record.revision})


@csrf_protect
@require_http_methods(["DELETE"])
def delete_account(request):
    if not request.user.is_authenticated:
        return respond_error("Not authenticated.", 401)
    try:
        password = payload(request).get("password")
    except ValueError as exc:
        return respond_error(str(exc))
    if not isinstance(password,str) or not request.user.check_password(password):
        return respond_error("Password confirmation failed.", 400)
    user = request.user
    logout(request)
    user.delete()
    return JsonResponse({"detail": "Account and its saved board deleted."})


