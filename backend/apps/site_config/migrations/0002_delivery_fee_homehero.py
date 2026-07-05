# Generated manually for delivery fee and homepage hero.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("media_library", "0001_initial"),
        ("site_config", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="siteconfig",
            name="delivery_fee_amount",
            field=models.PositiveIntegerField(
                default=0,
                help_text="In bani. Taxă livrare standard. 0 = fără taxă.",
            ),
        ),
        migrations.CreateModel(
            name="HomeHero",
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
                (
                    "tagline",
                    models.CharField(default="scris cu suflet", max_length=120),
                ),
                (
                    "title",
                    models.CharField(default="Cadouri personalizate", max_length=200),
                ),
                (
                    "copy",
                    models.TextField(
                        blank=True,
                        default=(
                            "Împreună scriem cadoul potrivit. La Ave Letter Studio găsești "
                            "idei de cadouri caligrafiate manual, gândite pentru oamenii dragi."
                        ),
                    ),
                ),
                (
                    "primary_button_label",
                    models.CharField(default="VEZI PRODUSELE", max_length=80),
                ),
                (
                    "primary_button_url",
                    models.CharField(default="/shop", max_length=255),
                ),
                (
                    "secondary_button_label",
                    models.CharField(default="SERVICII", max_length=80),
                ),
                (
                    "secondary_button_url",
                    models.CharField(default="#servicii", max_length=255),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "background_image",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="media_library.mediaasset",
                    ),
                ),
            ],
            options={
                "verbose_name": "homepage hero",
                "verbose_name_plural": "homepage hero",
            },
        ),
    ]
