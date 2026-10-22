from django.db import migrations, models


def preserve_made_to_order(apps, schema_editor):
    Product = apps.get_model("shop", "Product")
    Product.objects.exclude(product_type="premade").filter(stock_quantity=0).update(
        stock_quantity=None,
    )


def restore_zero_defaults(apps, schema_editor):
    apps.get_model("shop", "Product").objects.filter(stock_quantity=None).update(
        stock_quantity=0,
    )


class Migration(migrations.Migration):
    dependencies = [("shop", "0008_product_categories_m2m")]
    operations = [
        migrations.AlterField(
            model_name="product", name="stock_quantity",
            field=models.PositiveIntegerField(
                null=True, blank=True, default=None,
                help_text="Units available. Empty means made to order; zero means sold out.",
            ),
        ),
        migrations.AlterField(
            model_name="product", name="stock_status",
            field=models.CharField(
                max_length=20, default="on_order",
                choices=[("in_stock", "În stoc"), ("limited", "Stoc limitat"), ("on_order", "La comandă")],
                help_text="How availability is shown to clients when stock is available.",
            ),
        ),
        migrations.RunPython(preserve_made_to_order, restore_zero_defaults),
    ]
