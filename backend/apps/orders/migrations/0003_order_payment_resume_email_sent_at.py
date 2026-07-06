# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="payment_resume_email_sent_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When the customer was emailed a link to resume Stripe payment.",
                null=True,
            ),
        ),
    ]
