from django.urls import path
from accounts import views

urlpatterns = [
    path("api/config/", views.config),
    path("api/auth/csrf/", views.csrf),
    path("api/auth/signup/", views.signup),
    path("api/auth/verify-otp/", views.verify_otp),
    path("api/auth/resend-otp/", views.resend_otp),
    path("api/auth/login/", views.signin),
    path("api/auth/logout/", views.signout),
    path("api/auth/me/", views.me),
    path("api/board/", views.board),
    path("api/account/", views.delete_account),
    path("", views.index),
]
