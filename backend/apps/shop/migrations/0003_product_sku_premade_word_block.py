# Generated manually for product SKU, premade type, and per-word-block pricing.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0002_textpricing_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="sku",
            field=models.CharField(
                blank=True,
                default=None,
                max_length=100,
                null=True,
                unique=True,
            ),
        ),
        migrations.AlterField(
            model_name="product",
            name="product_type",
            field=models.CharField(
                choices=[
                    ("standard", "Standard product"),
                    ("text_by_page", "Text priced by page"),
                    ("ornament", "Short text ornament"),
                    ("custom_quote", "Custom quote"),
                    ("premade", "Premade product (with stock)"),
                ],
                default="standard",
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="textbypagepricing",
            name="pricing_mode",
            field=models.CharField(
                choices=[
                    ("per_page", "Pe pagină"),
                    ("per_word", "Pe cuvânt"),
                    ("per_word_block", "Pe X cuvinte"),
                    ("per_character", "Pe caracter"),
                ],
                default="per_page",
                max_length=20,
            ),
        ),
    ]
