from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("orders", "0005_notification_defaults")]
    operations = [
        migrations.AddField(
            model_name="orderline", name="reserved_product_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="orderline", name="reserved_variant_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
