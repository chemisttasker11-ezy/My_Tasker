from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("accounts","0001_initial")]
    operations = [
      migrations.CreateModel(name="AdminSecurity",fields=[
        ("id",models.BigAutoField(primary_key=True,serialize=False)),
        ("totp_ciphertext",models.TextField(blank=True)),
        ("pending_ciphertext",models.TextField(blank=True)),
        ("pending_created_at",models.DateTimeField(null=True,blank=True)),
        ("last_accepted_step",models.BigIntegerField(default=-1)),
        ("backup_hashes",models.JSONField(default=list)),
        ("user",models.OneToOneField(to=settings.AUTH_USER_MODEL,on_delete=django.db.models.deletion.CASCADE,related_name="admin_security")),
      ]),
      migrations.CreateModel(name="AdminAudit",fields=[
        ("id",models.BigAutoField(primary_key=True,serialize=False)),
        ("created_at",models.DateTimeField(auto_now_add=True,db_index=True)),
        ("action",models.CharField(max_length=64,db_index=True)),
        ("metadata",models.JSONField(default=dict)),
        ("ip_hash",models.CharField(max_length=64,blank=True)),
        ("actor",models.ForeignKey(to=settings.AUTH_USER_MODEL,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="+")),
        ("subject",models.ForeignKey(to=settings.AUTH_USER_MODEL,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="+")),
      ],options={"ordering":["-created_at","-id"]}),
    ]
