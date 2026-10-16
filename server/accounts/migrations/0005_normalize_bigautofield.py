from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[("accounts","0004_verified_email")]
    operations=[
        migrations.AlterField(
            model_name=name,name="id",
            field=models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name="ID"),
        )
        for name in (
            "adminaudit","adminsecurity","emailotp",
            "userboard","usersessionstamp","verifiedemail"
        )
    ]
