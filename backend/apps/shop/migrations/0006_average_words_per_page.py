from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0005_required_text_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="textbypagepricing",
            name="average_words_per_page",
            field=models.PositiveIntegerField(
                blank=True,
                help_text=(
                    "Cuvinte pe pagină în medie — folosit doar pentru estimarea paginilor "
                    "afișată clientului (mod „Pe X cuvinte”)."
                ),
                null=True,
            ),
        ),
    ]
