import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("media_library", "0001_initial"),
        ("site_config", "0002_delivery_fee_homehero"),
    ]

    operations = [
        migrations.CreateModel(
            name="HomeInstagram",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "homepage Instagram strip",
                "verbose_name_plural": "homepage Instagram strip",
            },
        ),
        migrations.CreateModel(
            name="HomeInstagramImage",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "asset",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="media_library.mediaasset",
                    ),
                ),
                (
                    "strip",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="images",
                        to="site_config.homeinstagram",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="homeinstagramimage",
            constraint=models.UniqueConstraint(
                fields=("strip", "asset"),
                name="unique_home_instagram_asset",
            ),
        ),
    ]
