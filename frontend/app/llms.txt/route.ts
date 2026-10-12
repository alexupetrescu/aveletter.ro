import { getAllProducts, getCategories, getSiteConfig } from "@/lib/api";
import { resolveContact } from "@/lib/contact";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET() {
  const [config, categories, products] = await Promise.all([getSiteConfig(), getCategories(), getAllProducts()]);
  const contact = resolveContact(config);
  const used = new Set(products.flatMap((p) => (p.categories?.length ? p.categories : p.category ? [p.category] : []).map((c) => c.slug)));
  const link = (name: string, path: string) => `- [${name.replace(/[\[\]\r\n]/g, " ")}](${absoluteUrl(path, config)})`;
  const text = [
    "# Ave Letter Studio", "", "> Cadouri și obiecte personalizate prin caligrafie manuală, din România.", "",
    `Contact: ${contact.email} · ${contact.phoneDisplay} · ${contact.location}`, "",
    "## Pagini principale", "", link("Acasă", "/"), link("Produse", "/shop"), link("Jurnal", "/blog"),
    link("Personalizare, prețuri și livrare", "/ghid-comenzi"), link("Contact", "/contact"), "",
    "## Colecții", "", ...categories.filter((c) => used.has(c.slug)).map((c) => link(c.name, `/shop/categorie/${c.slug}`)), "",
    "## Produse", "", ...products.map((p) => link(p.title, `/shop/${p.slug}`)), "",
    "## Comenzi", "", "Conținutul este în limba română. Prețurile, opțiunile și timpii de producție actuali sunt pe paginile produselor. Prețul final al unui produs personalizat depinde de configurația aleasă.",
    `Comenzile prin site se livrează în România. Pentru livrări internaționale, contactați atelierul la ${contact.email}.`, "",
  ].join("\n");
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
