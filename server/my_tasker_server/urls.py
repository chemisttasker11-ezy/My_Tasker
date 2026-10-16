from django.urls import path
from accounts import auth_api, board_api, system_api, admin_api

urlpatterns = [
    path("healthz/", system_api.healthz),
    path("api/config/", system_api.config),
    path("api/admin/status/", admin_api.status),
    path("api/admin/enroll/", admin_api.enroll),
    path("api/admin/verify/", admin_api.verify_admin),
    path("api/admin/overview/", admin_api.overview),
    path("api/admin/users/", admin_api.users),
    path("api/admin/users/<int:user_id>/status/", admin_api.set_user_status),
    path("api/admin/users/<int:user_id>/sessions/", admin_api.revoke_sessions),
    path("api/admin/users/<int:user_id>/staff/", admin_api.set_staff),
    path("api/admin/audit/", admin_api.audit),
    path("api/admin/health/", admin_api.health),
    path("api/auth/csrf/", system_api.csrf),
    path("api/auth/signup/", auth_api.signup),
    path("api/auth/verify-otp/", auth_api.verify_otp),
    path("api/auth/resend-otp/", auth_api.resend_otp),
    path("api/auth/login/", auth_api.signin),
    path("api/auth/logout/", auth_api.signout),
    path("api/auth/request-password-reset/", auth_api.request_reset),
    path("api/auth/reset-password/", auth_api.reset_password),
    path("api/auth/me/", auth_api.me),
    path("api/board/", board_api.board),
    path("api/account/", board_api.delete_account),
    path("", system_api.index),
]
