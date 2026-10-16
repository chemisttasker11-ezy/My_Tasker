from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("accounts", "0003_session_stamp")]
    operations = [
        migrations.CreateModel(
            name="VerifiedEmail",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("verified_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="verified_email", to=settings.AUTH_USER_MODEL
                ))
            ],
        )
    ]
