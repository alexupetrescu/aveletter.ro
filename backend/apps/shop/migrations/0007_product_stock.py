from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0006_average_words_per_page"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="stock_quantity",
            field=models.PositiveIntegerField(
                default=0,
                help_text="For premade products: units available in atelier.",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="stock_status",
            field=models.CharField(
                choices=[
                    ("in_stock", "În stoc"),
                    ("limited", "Stoc limitat"),
                    ("on_order", "La comandă"),
                ],
                default="on_order",
                help_text="How availability is shown to clients (premade products).",
                max_length=20,
            ),
        ),
    ]
