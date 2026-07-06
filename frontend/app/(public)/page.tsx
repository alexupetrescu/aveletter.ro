import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getCategories, getProducts, getSiteConfig } from "@/lib/api";
import { resolveContact } from "@/lib/contact";
import PhotoBox from "@/components/PhotoBox";
import FilledLink from "@/components/FilledLink";
import ProductCard from "@/components/ProductCard";

export const revalidate = 60;

const CALIGRAPHY_YEARS = new Date().getFullYear() - 2017;

export const metadata: Metadata = {
  title: "Ave Letter Studio — Cadouri personalizate prin caligrafie",
};

const SERVICES = [
  {
    number: "01",
    title: "Invitații & mărturii de nuntă",
    text: "Seturi personalizate caligrafiate manual, pentru cea mai frumoasă zi.",
  },
  {
    number: "02",
    title: "Tablouri caligrafice",
    text: "Texte, jurăminte sau versuri așternute pe hârtie fină, înrămate.",
  },
  {
    number: "03",
    title: "Caligrafie pe obiect",
    text: "Sticlă, ceramică, lemn sau pânză — mesajul tău, scris de mână.",
  },
];

async function loadData() {
  try {
    const [categories, products, siteConfig] = await Promise.all([
      getCategories(),
      getProducts({ featured: true }),
      getSiteConfig().catch(() => null),
    ]);
    return { categories, products, siteConfig };
  } catch {
    return { categories: [], products: [], siteConfig: null };
  }
}

export default async function LandingPage() {
  const { categories, products, siteConfig } = await loadData();
  const hero = siteConfig?.hero;
  const contact = resolveContact(siteConfig);

  return (
    <div>
      {/* HERO */}
      <div
        className="photo-placeholder-dark relative flex min-h-[560px] items-center !justify-start h-[88vh]"
        style={
          hero?.background_image_url
            ? {
                backgroundImage: `url(${hero.background_image_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {!hero?.background_image_url && (
          <div className="absolute top-[26px] left-1/2 -translate-x-1/2 font-mono text-xs tracking-[0.5px] text-stone">
            [ foto: masă de atelier, cerneală &amp; pană, lumină naturală ]
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,246,240,0.55)_0%,rgba(248,246,240,0.1)_55%)]" />
        <div className="relative mx-auto w-full max-w-[1440px] px-6 lg:px-12">
          <div className="max-w-[620px]">
            <div className="mb-4 inline-block bg-white/75 px-4 py-2 backdrop-blur-[2px]">
              <span className="font-script text-[30px] text-olive">
                {hero?.tagline ?? "scris cu suflet"}
              </span>
            </div>
            <h1 className="mb-6 font-serif text-[52px] leading-[1.02] font-medium tracking-[0.5px] lg:text-[76px]">
              <span className="mb-3 block font-sans text-[11px] font-normal tracking-[2.5px] text-muted uppercase">
                Ave Letter Studio — Cadouri personalizate prin caligrafie
              </span>
              <span className="block whitespace-pre-line">
                {hero?.title ?? "Cadouri\npersonalizate"}
              </span>
            </h1>
            <p className="mb-9 max-w-[460px] text-base leading-[1.75] text-body">
              {hero?.copy ??
                "Împreună scriem cadoul potrivit. La Ave Letter Studio găsești idei de cadouri caligrafiate manual, gândite pentru oamenii dragi."}
            </p>
            <div className="flex gap-4">
              <FilledLink href={hero?.primary_button_url ?? "/shop"}>
                {hero?.primary_button_label ?? "VEZI PRODUSELE"}
              </FilledLink>
              <Link
                href={hero?.secondary_button_url ?? "#servicii"}
                className="avelink border border-ink px-[34px] py-4 text-xs tracking-[2px]"
              >
                {hero?.secondary_button_label ?? "SERVICII"}
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute right-0 bottom-7 left-0 h-px bg-[linear-gradient(90deg,transparent,#A4873E_20%,#A4873E_80%,transparent)]" />
      </div>

      {/* ABOUT TEASER */}
      <div
        id="despre"
        className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-[0.85fr_1fr] lg:gap-20 lg:px-12 lg:py-[130px]"
      >
        <Image
          src="/images/aveletter_adinapetrescu-922x1024.jpg"
          alt="Adina Petrescu în atelierul Ave Letter Studio"
          width={922}
          height={1024}
          className="aspect-[4/5] w-full object-cover"
          priority
        />
        <div>
          <div className="mb-2.5 font-script text-[26px] text-olive">
            bună, eu sunt Adina
          </div>
          <h2 className="mb-[26px] font-serif text-[36px] leading-[1.15] font-medium lg:text-[44px]">
            Un atelier de suflet, o poveste scrisă de mână
          </h2>
          <p className="mb-5 text-[15.5px] leading-[1.9] text-soft">
            Practic caligrafia de aproximativ {CALIGRAPHY_YEARS} ani — timp în
            care am
            descoperit un stil propriu și o ocupație care îmi umple sufletul
            de bucurie și răgaz.
          </p>
          <p className="mb-[34px] text-[15.5px] leading-[1.9] text-soft">
            Caligrafia spune o poveste, fie că mesajul e scris pe hârtie,
            sticlă sau lemn. Nu vreau să rămâi doar cu un produs cumpărat —
            vreau să rămâi cu emoția unui cadou personalizat.
          </p>
          <Link
            href="/blog"
            className="avelink border-b border-ink pb-1 text-xs tracking-[2px]"
          >
            CITEȘTE POVESTEA COMPLETĂ →
          </Link>
        </div>
      </div>

      {/* CATEGORIES */}
      <div className="border-y border-ink/8 bg-paper px-6 py-20 lg:px-12 lg:py-[110px]">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-[72px] text-center">
            <div className="mb-3.5 text-[11px] tracking-[3px] text-olive">
              CE GĂSEȘTI ÎN ATELIER
            </div>
            <h2 className="font-serif text-[34px] font-medium lg:text-[42px]">
              Categorii de cadouri
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-x-11 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/shop?categorie=${cat.slug}`}
                className="avelink block"
              >
                <PhotoBox
                  asset={cat.image}
                  label={`foto: ${cat.name}`}
                  aspect="5/4"
                  className="mb-[22px]"
                  variant="dark"
                />
                <h3 className="mb-2 font-serif text-[23px] font-medium">
                  {cat.name}
                </h3>
                <p className="text-[13px] text-muted">
                  {cat.description || "caligrafie manuală, cu grijă"}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* FEATURED PRODUCTS */}
      <div className="mx-auto max-w-[1440px] px-6 py-20 lg:px-12 lg:py-[120px]">
        <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-3.5 text-[11px] tracking-[3px] text-olive">
              SELECȚIE ATELIER
            </div>
            <h2 className="font-serif text-[34px] font-medium lg:text-[42px]">
              Produse recente
            </h2>
          </div>
          <Link
            href="/shop"
            className="avelink border-b border-ink pb-1 text-xs tracking-[2px] whitespace-nowrap"
          >
            TOATE PRODUSELE →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-[38px] sm:grid-cols-2 lg:grid-cols-4">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </div>

      {/* QUOTE BAND */}
      <div className="bg-ink px-6 py-20 text-center text-paper lg:px-12 lg:py-[130px]">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-[22px] font-script text-[40px] text-gold lg:text-[52px]">
            La Ave Letter Studio
          </div>
          <p className="m-0 font-serif text-[22px] leading-[1.6] italic text-[#eee9df] lg:text-[28px]">
            „literele prind viață prin poveștile și dorințele tale — fiecare
            rând este scris cu grijă, pentru un moment care merită păstrat.”
          </p>
          <div className="mx-auto mt-9 h-px w-16 bg-gold" />
        </div>
      </div>

      {/* SERVICES */}
      <div
        id="servicii"
        className="mx-auto max-w-[1440px] px-6 py-20 lg:px-12 lg:py-[120px]"
      >
        <div className="mb-16 text-center">
          <div className="mb-3.5 text-[11px] tracking-[3px] text-olive">
            SERVICII
          </div>
          <h2 className="font-serif text-[34px] font-medium lg:text-[42px]">
            Caligrafie pentru momentele tale
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-14 md:grid-cols-3">
          {SERVICES.map((service) => (
            <div key={service.number} className="px-5 text-center">
              <div className="mb-[18px] font-serif text-[34px] text-olive">
                {service.number}
              </div>
              <h3 className="mb-3.5 font-serif text-2xl font-medium">
                {service.title}
              </h3>
              <p className="text-[14.5px] leading-[1.8] text-muted">
                {service.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* INSTAGRAM STRIP */}
      <div className="border-t border-ink/8 bg-paper py-20 lg:py-[100px]">
        <div className="mx-auto flex max-w-[1440px] items-baseline justify-between px-6 pb-12 lg:px-12">
          <h2 className="font-serif text-[26px] font-medium lg:text-[32px]">
            <a
              href={contact.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="avelink"
            >
              Din atelier, pe Instagram
            </a>
          </h2>
          <a
            href={contact.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="avelink text-xs tracking-[2px] text-muted"
          >
            {contact.instagramHandle}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <PhotoBox key={i} aspect="1/1" variant="dark" label="foto" />
          ))}
        </div>
      </div>

      {/* NEWSLETTER */}
      <div className="px-6 py-20 text-center lg:px-12 lg:py-[110px]">
        <div className="mx-auto max-w-[520px]">
          <h2 className="mb-4 font-serif text-[34px] font-medium">
            Rămâi la curent
          </h2>
          <p className="mb-8 text-[14.5px] leading-[1.7] text-muted">
            Colecții noi de sezon, povești din atelier și idei de cadouri —
            direct în inbox.
          </p>
          <form className="mx-auto flex max-w-[420px] border-b border-ink">
            <input
              placeholder="adresa ta de email"
              className="flex-1 bg-transparent px-1 py-3.5 font-sans text-[13.5px] outline-none"
            />
            <button
              type="submit"
              className="cursor-pointer px-2 py-3.5 text-xs tracking-[2px]"
            >
              ABONEAZĂ-TE →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
