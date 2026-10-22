from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("shop", "0009_product_stock_all_types")]
    operations = [
        migrations.AddField(
            model_name="product", name="show_price",
            field=models.BooleanField(
                default=True, help_text="Display prices on product cards and product pages.",
            ),
        ),
    ]
