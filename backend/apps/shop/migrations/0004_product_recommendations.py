# Generated manually for product upsell / cross-sell recommendations.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0003_product_sku_premade_word_block"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductRecommendation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "kind",
                    models.CharField(
                        choices=[("upsell", "Upsell"), ("cross_sell", "Cross-sell")],
                        max_length=20,
                    ),
                ),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "source",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="outgoing_recommendations",
                        to="shop.product",
                    ),
                ),
                (
                    "target",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="incoming_recommendations",
                        to="shop.product",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "id"],
                "unique_together": {("source", "target", "kind")},
            },
        ),
        migrations.AddIndex(
            model_name="productrecommendation",
            index=models.Index(fields=["source", "kind", "sort_order"], name="shop_prodre_source_k_8a1f0d_idx"),
        ),
    ]
