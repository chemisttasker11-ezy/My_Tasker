from django.conf import settings
from django.db import models

class EmailOTP(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="email_otp")
    code_hash = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    sent_at = models.DateTimeField()
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    purpose = models.CharField(max_length=12, default="verify")

class UserBoard(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="private_board")
    payload = models.JSONField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

class RateBucket(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    window_start = models.DateTimeField()
    count = models.PositiveIntegerField(default=0)

class AdminSecurity(models.Model):
    """Authenticator state is encrypted at rest, backups are one-way hashed."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="admin_security")
    totp_ciphertext = models.TextField(blank=True)
    pending_ciphertext = models.TextField(blank=True)
    pending_created_at = models.DateTimeField(null=True, blank=True)
    last_accepted_step = models.BigIntegerField(default=-1)
    backup_hashes = models.JSONField(default=list)

class AdminAudit(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    subject = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=64, db_index=True)
    metadata = models.JSONField(default=dict)
    ip_hash = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

class UserSessionStamp(models.Model):
    """Lightweight, transactionally revocable user session generation."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="session_stamp")
    version = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
