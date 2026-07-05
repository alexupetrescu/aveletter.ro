# Generated manually for text pricing modes and field rename.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0001_initial"),
    ]

    operations = [
        migrations.RenameField(
            model_name="textbypagepricing",
            old_name="price_per_page_amount",
            new_name="price_per_unit_amount",
        ),
        migrations.AddField(
            model_name="textbypagepricing",
            name="pricing_mode",
            field=models.CharField(
                choices=[
                    ("per_page", "Pe pagină"),
                    ("per_word", "Pe cuvânt"),
                    ("per_character", "Pe caracter"),
                ],
                default="per_page",
                max_length=20,
            ),
        ),
    ]
