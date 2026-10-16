from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone

class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name="RateBucket", fields=[
            ("key", models.CharField(max_length=64, primary_key=True, serialize=False)),
            ("window_start", models.DateTimeField()),
            ("count", models.PositiveIntegerField(default=0)),
        ]),
        migrations.CreateModel(name="EmailOTP", fields=[
            ("id", models.BigAutoField(primary_key=True, serialize=False)),
            ("code_hash", models.CharField(max_length=255)),
            ("expires_at", models.DateTimeField()),
            ("sent_at", models.DateTimeField()),
            ("failed_attempts", models.PositiveSmallIntegerField(default=0)),
            ("locked_until", models.DateTimeField(blank=True, null=True)),
            ("purpose", models.CharField(default="verify", max_length=12)),
            ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="email_otp", to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name="UserBoard", fields=[
            ("id", models.BigAutoField(primary_key=True, serialize=False)),
            ("payload", models.JSONField(blank=True, null=True)),
            ("revision", models.PositiveIntegerField(default=0)),
            ("updated_at", models.DateTimeField(auto_now=True)),
            ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="private_board", to=settings.AUTH_USER_MODEL)),
        ]),
    ]
