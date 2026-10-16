from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("accounts","0002_admin_security")]
    operations = [
       migrations.CreateModel(name="UserSessionStamp",fields=[
         ("id",models.BigAutoField(primary_key=True,serialize=False)),
         ("version",models.PositiveIntegerField(default=0)),
         ("updated_at",models.DateTimeField(auto_now=True)),
         ("user",models.OneToOneField(to=settings.AUTH_USER_MODEL,on_delete=django.db.models.deletion.CASCADE,related_name="session_stamp")),
       ])
    ]
