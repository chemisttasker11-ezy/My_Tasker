"""Security acceptance: password + TOTP, OTP replay, backup recovery, role boundaries,
verified-email activation, session revocation and non-disclosure of private boards."""
import json
from unittest.mock import patch
import pyotp
from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.test import Client, TestCase, override_settings
from .models import AdminSecurity, AdminAudit, UserBoard, UserSessionStamp, VerifiedEmail, EmailOTP

User=get_user_model()

@override_settings(ADMIN_TOTP_ENCRYPTION_KEY=Fernet.generate_key().decode(),RECAPTCHA_SECRET_KEY="test-only",RECAPTCHA_SITE_KEY="test-only",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AdminMFAAcceptance(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=True)
        self.client.get("/api/auth/csrf/")
        self.csrf=self.client.cookies["csrftoken"].value
        self.owner=User.objects.create_superuser(username="owner@example.test",email="owner@example.test",password="HighlySecureAdmin#2026")
    def post(self,path,data,client=None,csrf=None):
        return (client or self.client).post(path,data=json.dumps(data),content_type="application/json",HTTP_X_CSRFTOKEN=csrf or self.csrf)
    def password_stage(self):
        result=self.post("/api/auth/login/",{"email":self.owner.email,"password":"HighlySecureAdmin#2026"})
        self.assertEqual(result.status_code,202,result.content)
        self.assertTrue(result.json()["admin_challenge"])
        return result
    def enrolled_admin(self):
        self.password_stage()
        self.assertEqual(self.client.get("/api/admin/overview/").status_code,403)
        setup=self.post("/api/admin/enroll/",{}).json()
        secret=setup["secret"]
        self.assertIn("otpauth://totp/",setup["uri"])
        self.assertTrue(setup["qr"].startswith("data:image/png;base64,"))
        response=self.post("/api/admin/verify/",{"code":pyotp.TOTP(secret).now()})
        self.assertEqual(response.status_code,200,response.content)
        self.assertEqual(len(response.json()["backup_codes"]),8)
        self.assertEqual(self.client.get("/api/admin/status/").json()["stage"],"ready")
        return secret,response.json()["backup_codes"]
    def test_admin_requires_password_and_mfa_before_data_access(self):
        self.assertEqual(self.client.get("/api/admin/overview/").status_code,403)
        self.password_stage()
        self.assertEqual(self.client.get("/api/auth/me/").status_code,401)
        self.assertEqual(self.client.get("/api/board/").status_code,401)
        self.assertEqual(self.client.get("/api/admin/overview/").status_code,403)
        self.assertEqual(self.client.get("/api/admin/status/").json()["stage"],"enroll")
        self.assertTrue(self.post("/api/admin/verify/",{"code":"123456"}).status_code>=400)
        self.assertEqual(self.client.get("/api/admin/overview/").status_code,403)
    def test_admin_setup_totp_secrets_encrypted_backup_codes_single_use(self):
        secret,codes=self.enrolled_admin()
        record=AdminSecurity.objects.get(user=self.owner)
        self.assertNotIn(secret,record.totp_ciphertext)
        self.assertTrue(record.totp_ciphertext)
        self.assertNotIn(codes[0],record.backup_hashes)
        self.assertEqual(self.client.get("/api/admin/overview/").status_code,200)
        self.post("/api/auth/logout/",{})
        self.password_stage()
        self.assertEqual(self.client.get("/api/admin/status/").json()["stage"],"challenge")
        back=self.post("/api/admin/verify/",{"code":codes[0]})
        self.assertEqual(back.status_code,200,back.content)
        self.assertEqual(len(AdminSecurity.objects.get(user=self.owner).backup_hashes),7)
        self.post("/api/auth/logout/",{})
        self.password_stage()
        self.assertEqual(self.post("/api/admin/verify/",{"code":codes[0]}).status_code,401)
    def test_totp_replay_refused(self):
        secret,_=self.enrolled_admin()
        self.post("/api/auth/logout/",{})
        self.password_stage()
        self.assertEqual(self.post("/api/admin/verify/",{"code":pyotp.TOTP(secret).now()}).status_code,401)
    def test_admin_cannot_reactivate_unverified_and_can_restore_verified_suspension(self):
        self.enrolled_admin()
        fresh=User.objects.create_user(username="fresh@example.test",email="fresh@example.test",password="ExampleUser#2026",is_active=False)
        result=self.post(f"/api/admin/users/{fresh.id}/status/",{"active":True})
        self.assertEqual(result.status_code,409)
        self.assertFalse(User.objects.get(pk=fresh.pk).is_active)
        old=User.objects.create_user(username="old@example.test",email="old@example.test",password="ExampleUser#2026",is_active=False)
        VerifiedEmail.objects.create(user=old)
        restored=self.post(f"/api/admin/users/{old.id}/status/",{"active":True})
        self.assertEqual(restored.status_code,200,restored.content)
        self.assertTrue(User.objects.get(pk=old.pk).is_active)
        self.assertEqual(self.post(f"/api/admin/users/{fresh.id}/staff/",{"staff":True}).status_code,403)
    def test_revoke_user_sessions_and_audit_without_task_data(self):
        self.enrolled_admin()
        target=User.objects.create_user(username="person@example.test",email="person@example.test",password="ExampleUser#2026",is_active=True)
        VerifiedEmail.objects.create(user=target)
        own=Client(enforce_csrf_checks=True)
        own.get("/api/auth/csrf/")
        csrf=own.cookies["csrftoken"].value
        self.assertEqual(self.post("/api/auth/login/",{"email":target.email,"password":"ExampleUser#2026"},client=own,csrf=csrf).status_code,200)
        board={"version":1,"tasks":[{"title":"Sensitive personal diary"}],"completions":[]}
        self.assertEqual(own.put("/api/board/",data=json.dumps({"board":board,"revision":0}),content_type="application/json",HTTP_X_CSRFTOKEN=csrf).status_code,200)
        self.assertEqual(self.post(f"/api/admin/users/{target.pk}/sessions/",{}).status_code,200)
        self.assertEqual(own.get("/api/board/").status_code,401)
        response=self.client.get("/api/admin/overview/").json()
        self.assertEqual(response["users"]["saved_boards"],1)
        self.assertNotIn("Sensitive personal diary",json.dumps(response))
        self.assertIn("user.sessions_revoked",[a.action for a in AdminAudit.objects.all()])
    def test_nonowner_staff_cannot_promote_accounts(self):
        self.enrolled_admin()
        delegate=User.objects.create_user(username="delegate@example.test",email="delegate@example.test",password="StaffSecure#2026",is_active=True)
        VerifiedEmail.objects.create(user=delegate)
        result=self.post(f"/api/admin/users/{delegate.pk}/staff/",{"staff":True})
        self.assertEqual(result.status_code,200)
        self.assertTrue(User.objects.get(pk=delegate.pk).is_staff)
        self.post("/api/auth/logout/",{})
        self.post("/api/auth/login/",{"email":delegate.email,"password":"StaffSecure#2026"})
        self.assertEqual(self.client.get("/api/admin/overview/").status_code,403)
        own=self.post("/api/admin/enroll/",{}).json()
        self.assertEqual(self.post("/api/admin/verify/",{"code":pyotp.TOTP(own["secret"]).now()}).status_code,200)
        self.assertEqual(self.client.get("/api/admin/overview/").status_code,200)
        self.assertEqual(self.post(f"/api/admin/users/{delegate.pk}/staff/",{"staff":False}).status_code,403)
        self.assertEqual(self.post(f"/api/admin/users/{self.owner.pk}/status/",{"active":False}).status_code,403)
