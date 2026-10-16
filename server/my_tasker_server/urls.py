from django.urls import path
from accounts import views, admin_api

urlpatterns = [
    path("healthz/", views.healthz),
    path("api/config/", views.config),
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
    path("api/auth/csrf/", views.csrf),
    path("api/auth/signup/", views.signup),
    path("api/auth/verify-otp/", views.verify_otp),
    path("api/auth/resend-otp/", views.resend_otp),
    path("api/auth/login/", views.signin),
    path("api/auth/logout/", views.signout),
    path("api/auth/request-password-reset/", views.request_reset),
    path("api/auth/reset-password/", views.reset_password),
    path("api/auth/me/", views.me),
    path("api/board/", views.board),
    path("api/account/", views.delete_account),
    path("", views.index),
]
