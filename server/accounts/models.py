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
