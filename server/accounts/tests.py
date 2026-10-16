import json
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core import mail
from django.contrib.auth.hashers import check_password
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from .models import EmailOTP, RateBucket, UserBoard

User = get_user_model()

@override_settings(RECAPTCHA_SECRET_KEY="test-secret", RECAPTCHA_SITE_KEY="test-site",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AccountAcceptance(TestCase):
    def setUp(self):
        self.c=Client(enforce_csrf_checks=True)
        self.c.get("/api/auth/csrf/")
        self.token=self.c.cookies["csrftoken"].value

    def post(self,path,data):
        return self.c.post(path,data=json.dumps(data),content_type="application/json",
                           HTTP_X_CSRFTOKEN=self.token)

    def register(self,email="alice@example.test"):
        with patch("accounts.views.captcha_valid", return_value=True):
            r=self.post("/api/auth/signup/",{"email":email,"password":"SafePassword#2026","captcha_token":"test-captcha"})
        self.assertEqual(r.status_code,201,r.content)
        user=User.objects.get(username=email)
        self.assertFalse(user.is_active)
        code=mail.outbox[-1].body.split(" is ")[1][:6]
        self.assertTrue(check_password(code,EmailOTP.objects.get(user=user).code_hash))
        return user,code

    def test_csrf_protected_registration_and_login(self):
        client=Client(enforce_csrf_checks=True)
        self.assertEqual(client.post("/api/auth/signup/","{}",content_type="application/json").status_code,403)
        user,code=self.register()
        self.assertEqual(self.post("/api/auth/login/",{"email":user.email,"password":"SafePassword#2026"}).status_code,401)
        self.assertEqual(self.post("/api/auth/verify-otp/",{"email":user.email,"otp":code}).status_code,200)
        self.assertEqual(self.post("/api/auth/login/",{"email":user.email,"password":"SafePassword#2026"}).status_code,200)
        self.assertEqual(self.c.get("/api/auth/me/").json()["user"]["email"],user.email)
        self.assertEqual(self.post("/api/auth/logout/",{}).status_code,200)
        self.assertEqual(self.c.get("/api/auth/me/").status_code,401)

    def test_wrong_code_lock_and_expiry(self):
        user,code=self.register()
        EmailOTP.objects.filter(user=user).update(expires_at=timezone.now()-timedelta(minutes=1))
        self.assertEqual(self.post("/api/auth/verify-otp/",{"email":user.email,"otp":code}).status_code,400)
        EmailOTP.objects.filter(user=user).update(expires_at=timezone.now()+timedelta(minutes=5))
        for _ in range(5):
            self.assertEqual(self.post("/api/auth/verify-otp/",{"email":user.email,"otp":"000000"}).status_code,400)
        self.assertIsNotNone(EmailOTP.objects.get(user=user).locked_until)
        self.assertEqual(self.post("/api/auth/verify-otp/",{"email":user.email,"otp":code}).status_code,400)

    def test_board_requires_session_and_is_private_with_conflict_protection(self):
        self.assertEqual(self.c.get("/api/board/").status_code,401)
        user,code=self.register()
        self.post("/api/auth/verify-otp/",{"email":user.email,"otp":code})
        self.post("/api/auth/login/",{"email":user.email,"password":"SafePassword#2026"})
        state={"version":1,"tasks":[{"title":"Alice confidential task"}],"completions":[],"plannedEntries":[]}
        response=self.c.put("/api/board/",data=json.dumps({"board":state,"revision":0}),
                            content_type="application/json",HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code,200,response.content)
        conflict=self.c.put("/api/board/",data=json.dumps({"board":state,"revision":0}),
                            content_type="application/json",HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(conflict.status_code,409)
        self.post("/api/auth/logout/",{})
        bob=User.objects.create_user(username="bob@example.test",email="bob@example.test",
                                     password="SafePassword#2026",is_active=True)
        self.post("/api/auth/login/",{"email":bob.email,"password":"SafePassword#2026"})
        self.assertIsNone(self.c.get("/api/board/").json()["board"])
        self.assertEqual(UserBoard.objects.get(user=user).payload,state)

    def test_recovery_changes_password_and_expires_code(self):
        user,code=self.register()
        self.post("/api/auth/verify-otp/",{"email":user.email,"otp":code})
        self.assertEqual(self.post("/api/auth/request-password-reset/",{"email":user.email}).status_code,200)
        recovery=mail.outbox[-1].body.split(" is ")[1][:6]
        self.assertEqual(self.post("/api/auth/reset-password/",{
            "email":user.email,"otp":recovery,"password":"EvenSaferPassword#2027"}).status_code,200)
        self.assertEqual(self.post("/api/auth/login/",{"email":user.email,"password":"SafePassword#2026"}).status_code,401)
        self.assertEqual(self.post("/api/auth/login/",{"email":user.email,"password":"EvenSaferPassword#2027"}).status_code,200)

    def test_delete_account_cascades_personal_board(self):
        user,code=self.register()
        self.post("/api/auth/verify-otp/",{"email":user.email,"otp":code})
        self.post("/api/auth/login/",{"email":user.email,"password":"SafePassword#2026"})
        r=self.c.delete("/api/account/",data=json.dumps({"password":"SafePassword#2026"}),
                        content_type="application/json",HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(r.status_code,200,r.content)
        self.assertFalse(User.objects.filter(pk=user.pk).exists())
        self.assertEqual(self.c.get("/api/board/").status_code,401)

    def test_ip_rate_bucket_does_not_store_plain_address(self):
        self.post("/api/auth/login/",{"email":"unknown@example.test","password":"incorrect"})
        bucket=RateBucket.objects.first()
        self.assertRegex(bucket.key,r"^[a-f0-9]{64}$")
        self.assertNotIn("127.0.0.1",bucket.key)
