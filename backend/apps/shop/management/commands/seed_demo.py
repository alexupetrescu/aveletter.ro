from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.blog.models import AuthorProfile, Category as BlogCategory
from apps.blog.models import Post
from apps.orders.models import InvoiceSeries, TaxConfig, VatRate
from apps.shop.models import (
    Product,
    ProductCategory,
    ProductInputField,
    ProductOption,
    ProductOptionGroup,
    ProductVariant,
    TextByPagePricing,
)
from apps.site_config.models import SiteConfig

CATEGORIES = [
    "Invitații",
    "Jurăminte",
    "Tablouri caligrafiate",
    "Plicuri",
    "Ornamente",
    "Mărturii",
    "Produse digitale",
    "Cadouri personalizate",
]

CATEGORY_SLUGS = {
    "Invitații": "invitatii",
    "Jurăminte": "juraminte",
    "Tablouri caligrafiate": "tablouri-caligrafiate",
    "Plicuri": "plicuri",
    "Ornamente": "ornamente",
    "Mărturii": "marturii",
    "Produse digitale": "produse-digitale",
    "Cadouri personalizate": "cadouri-personalizate",
}


class Command(BaseCommand):
    help = "Seed fiscal config, invoice series, categories, and 3 demo products."

    def handle(self, *args, **options):
        # --- VAT / tax ---
        exempt, _ = VatRate.objects.get_or_create(
            name="Neplătitor de TVA",
            defaults={
                "rate_bp": 0,
                "is_exempt": True,
                "legal_mention": "Neplătitor de TVA conform art. 310 din Codul Fiscal",
            },
        )
        VatRate.objects.get_or_create(
            name="Standard 19%",
            defaults={"rate_bp": 1900, "is_active": False},
        )
        if not TaxConfig.objects.exists():
            TaxConfig.objects.create(
                vat_enabled=False,
                prices_include_vat=True,
                default_vat_rate=exempt,
                legal_name="Ave Letter Studio",
            )
            self.stdout.write("Created TaxConfig (TVA off).")

        # --- Invoice series ---
        InvoiceSeries.objects.get_or_create(code="AVE", defaults={"name": "Seria principală"})

        # --- Site config ---
        if not SiteConfig.objects.exists():
            SiteConfig.objects.create(
                site_name="Ave Letter Studio",
                contact_email="adina@aveletter.ro",
                contact_phone="+40746986415",
                instagram_url="https://www.instagram.com/aveletterstudio/",
                facebook_url="https://www.facebook.com/aveletterstudio/",
            )

        # --- Categories ---
        categories = {}
        for i, name in enumerate(CATEGORIES):
            cat, _ = ProductCategory.objects.get_or_create(
                slug=CATEGORY_SLUGS[name],
                defaults={"name": name, "sort_order": i},
            )
            categories[name] = cat

        now = timezone.now()

        # --- Demo product 1: standard ---
        if not Product.objects.filter(slug="invitatie-nunta-clasica").exists():
            p = Product.objects.create(
                title="Invitație de nuntă clasică",
                slug="invitatie-nunta-clasica",
                status=Product.Status.PUBLISHED,
                published_at=now,
                product_type=Product.ProductType.STANDARD,
                category=categories["Invitații"],
                short_description=(
                    "Invitație caligrafiată manual pe carton texturat premium, "
                    "cu plic asortat."
                ),
                description_text=(
                    "Fiecare invitație este scrisă de mână, cu cerneală arhivală, "
                    "pe carton de 300g. Include plic din hârtie kraft."
                ),
                base_price_amount=7500,
                is_featured=True,
            )
            ProductVariant.objects.create(
                product=p, name="Default", sku="AVE-CARD-001",
                track_stock=True, stock_quantity=20,
            )
            self.stdout.write(f"Created product: {p.title}")

        # --- Demo product 2: ornament ---
        if not Product.objects.filter(slug="glob-personalizat-caligrafie").exists():
            p = Product.objects.create(
                title="Glob personalizat cu caligrafie",
                slug="glob-personalizat-caligrafie",
                status=Product.Status.PUBLISHED,
                published_at=now,
                product_type=Product.ProductType.ORNAMENT,
                category=categories["Ornamente"],
                short_description=(
                    "Glob de sticlă pictat manual, personalizat cu numele dorit "
                    "în caligrafie."
                ),
                description_text=(
                    "Glob de sticlă de 8cm, personalizat manual cu unul sau două "
                    "cuvinte la alegere. Livrat în cutie cadou."
                ),
                base_price_amount=4500,
                is_featured=True,
            )
            ProductVariant.objects.create(product=p, name="Default", sku="AVE-ORN-001")
            ProductInputField.objects.create(
                product=p, key="words", label="Cuvintele dorite",
                field_type=ProductInputField.FieldType.SHORT_TEXT,
                required=True, max_words=2,
                placeholder="ex: Maria",
                help_text="Maxim două cuvinte (nume, an, etc).",
            )
            color = ProductOptionGroup.objects.create(
                product=p, name="Culoare", slug="culoare",
                display_type=ProductOptionGroup.DisplayType.COLOR,
                required=True, min_selections=1, max_selections=1, sort_order=0,
            )
            ProductOption.objects.create(
                group=color, label="Auriu", value="auriu",
                color_hex="#C9A227", sort_order=0,
            )
            ProductOption.objects.create(
                group=color, label="Argintiu", value="argintiu",
                color_hex="#C0C0C0", sort_order=1,
            )
            ProductOption.objects.create(
                group=color, label="Roșu", value="rosu",
                color_hex="#A02929", price_delta_amount=500, sort_order=2,
            )
            shape = ProductOptionGroup.objects.create(
                product=p, name="Formă", slug="forma",
                display_type=ProductOptionGroup.DisplayType.RADIO,
                required=True, min_selections=1, max_selections=1, sort_order=1,
            )
            ProductOption.objects.create(group=shape, label="Inimă", value="inima", sort_order=0)
            ProductOption.objects.create(
                group=shape, label="Stea", value="stea",
                price_delta_amount=300, sort_order=1,
            )
            ProductOption.objects.create(group=shape, label="Cerc", value="cerc", sort_order=2)
            self.stdout.write(f"Created product: {p.title}")

        # --- Demo product 3: text by page ---
        if not Product.objects.filter(slug="juraminte-caligrafiate").exists():
            p = Product.objects.create(
                title="Jurăminte caligrafiate",
                slug="juraminte-caligrafiate",
                status=Product.Status.PUBLISHED,
                published_at=now,
                product_type=Product.ProductType.TEXT_BY_PAGE,
                category=categories["Jurăminte"],
                short_description=(
                    "Jurămintele voastre, scrise de mână pe hârtie premium. "
                    "Preț calculat pe pagină."
                ),
                description_text=(
                    "Trimiteți-ne textul jurămintelor și îl transformăm într-o "
                    "piesă caligrafiată. 100 de cuvinte pe pagină, taxă de setup "
                    "30 RON, 70 RON pe pagină."
                ),
                base_price_amount=0,
                is_featured=True,
            )
            ProductVariant.objects.create(product=p, name="Default", sku="AVE-VOW-001")
            ProductInputField.objects.create(
                product=p, key="message_text", label="Textul jurămintelor",
                field_type=ProductInputField.FieldType.LONG_TEXT,
                required=True,
                placeholder="Scrieți sau lipiți textul aici...",
                help_text="Prețul se calculează automat în funcție de numărul de cuvinte.",
            )
            TextByPagePricing.objects.create(
                product=p,
                text_field_key="message_text",
                words_per_page=100,
                price_per_unit_amount=7000,
                setup_fee_amount=3000,
                minimum_pages=1,
            )
            self.stdout.write(f"Created product: {p.title}")

        # --- Demo blog post ---
        if not Post.objects.exists():
            User = get_user_model()
            author = User.objects.filter(is_superuser=True).first() or User.objects.first()
            if author is None:
                author = User.objects.create_user(
                    username="adina", first_name="Adina", last_name="Petrescu",
                )
            AuthorProfile.objects.get_or_create(
                user=author,
                defaults={
                    "bio": (
                        "Caligrafiază de aproximativ 5 ani și conduce Ave Letter Studio, "
                        "un atelier de cadouri personalizate."
                    ),
                },
            )
            inspiratie, _ = BlogCategory.objects.get_or_create(
                slug="inspiratie", defaults={"name": "Inspirație"},
            )
            body_text = (
                "Un tablou caligrafic e ca o mărturisire care transformă o casă "
                "în... acasă. Nu e doar un obiect de decor — e o pagină oprită în "
                "timp, un gând scris cu grijă pentru cineva drag.\n\n"
                "Chiar dacă a trecut o lună de când am lăsat penița jos pentru o "
                "astfel de comandă, încă simt emoția acelor rânduri. E ceva aproape "
                "magic în a caligrafia gândurile unei mirese, ale unui cuplu la "
                "aniversare, sau ale unei familii care vrea să păstreze o amintire.\n\n"
                "„Voi fi alături de tine în toate anotimpurile vieții noastre, în "
                "bucurie și în încercare.” — un fragment din jurămintele scrise "
                "pentru o nuntă de vară, unul dintre acele texte care rămân cu tine "
                "mult după ce cerneala s-a uscat.\n\n"
                "Fiecare tablou pornește de la o discuție: ce sentiment vrei să "
                "rămână pe perete? Alegem apoi hârtia, cerneala și, dacă se "
                "potrivește, o ramură caligrafiată cu foiță aurie sau un sigiliu de "
                "ceară care încheie compoziția.\n\n"
                "Rezultatul e mereu unic — pentru că fiecare poveste, ca și scrisul "
                "de mână, nu se repetă niciodată la fel."
            )
            Post.objects.create(
                title=(
                    "Un tablou caligrafic e ca o mărturisire care transformă "
                    "o casă în... acasă"
                ),
                slug="tablou-caligrafic-marturisire",
                status=Post.Status.PUBLISHED,
                published_at=now,
                author=author,
                category=inspiratie,
                body={"format": "plain", "text": body_text},
                body_text=body_text,
                excerpt=(
                    "Despre puterea cuvintelor scrise de mână și cum un tablou "
                    "caligrafic poate deveni cea mai personală piesă dintr-o casă."
                ),
                reading_time=4,
            )
            self.stdout.write("Created demo blog post.")

        self.stdout.write(self.style.SUCCESS("Seed complete."))
