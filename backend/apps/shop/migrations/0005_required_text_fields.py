# Mark client text fields as required on letter / ornament products.

from django.db import migrations


def mark_text_fields_required(apps, schema_editor):
    Product = apps.get_model("shop", "Product")
    ProductInputField = apps.get_model("shop", "ProductInputField")
    TextByPagePricing = apps.get_model("shop", "TextByPagePricing")

    text_types = ("short_text", "long_text")

    ProductInputField.objects.filter(
        product__product_type__in=("text_by_page", "ornament"),
        field_type__in=text_types,
    ).update(required=True)

    for pricing in TextByPagePricing.objects.select_related("product"):
        ProductInputField.objects.filter(
            product_id=pricing.product_id,
            key=pricing.text_field_key,
        ).update(required=True)


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0004_product_recommendations"),
    ]

    operations = [
        migrations.RunPython(mark_text_fields_required, migrations.RunPython.noop),
    ]
