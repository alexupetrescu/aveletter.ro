# Generated manually for product multi-category support.

import django.db.models.deletion
from django.db import migrations, models


def copy_category_fk_to_assignments(apps, schema_editor):
    Product = apps.get_model("shop", "Product")
    ProductCategoryAssignment = apps.get_model("shop", "ProductCategoryAssignment")
    for product in Product.objects.exclude(category_id=None).iterator():
        ProductCategoryAssignment.objects.create(
            product_id=product.pk,
            category_id=product.category_id,
            is_primary=True,
            sort_order=0,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0007_product_stock"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductCategoryAssignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_primary", models.BooleanField(default=False)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "category",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="product_assignments",
                        to="shop.productcategory",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="category_assignments",
                        to="shop.product",
                    ),
                ),
            ],
            options={
                "ordering": ["-is_primary", "sort_order"],
                "unique_together": {("product", "category")},
            },
        ),
        migrations.AddField(
            model_name="product",
            name="categories",
            field=models.ManyToManyField(
                blank=True,
                related_name="products",
                through="shop.ProductCategoryAssignment",
                to="shop.productcategory",
            ),
        ),
        migrations.RunPython(copy_category_fk_to_assignments, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="product",
            name="category",
        ),
    ]
