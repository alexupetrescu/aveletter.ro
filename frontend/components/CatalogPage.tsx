import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, getCategories, getProductsPage, getSiteConfig } from "@/lib/api";
import { categoryCopy } from "@/lib/categories";
import { breadcrumbs, pageMetadata, paginatedPath } from "@/lib/seo";
import ShopIndex from "@/app/(public)/shop/ShopIndex";
import JsonLd from "./JsonLd";
import Pagination from "./Pagination";

const loadCatalog = cache(async (slug: string | undefined, page: number) => {
  const [categories, config] = await Promise.all([getCategories(), getSiteConfig().catch(() => null)]);
  const category = slug ? categories.find((c) => c.slug === slug) : undefined;
  if (slug && !category) notFound();
  try {
    const data = await getProductsPage({ category: slug, page });
    return { categories, category, config, data };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
});

export async function catalogMetadata(slug: string | undefined, page: number) {
  const { category, config, data } = await loadCatalog(slug, page);
  const copy = category ? categoryCopy(category) : { title: "Cadouri personalizate prin caligrafie", description: "Descoperă cadourile Ave Letter Studio: globuri, scrisori, semne de carte și tablouri personalizate prin caligrafie manuală." };
  return pageMetadata({ ...copy, title: `${copy.title}${page > 1 ? ` — Pagina ${page}` : ""}`,
    path: paginatedPath(slug ? `/shop/categorie/${slug}` : "/shop", page),
    image: category?.image?.url, config, noindex: data.count === 0,
  });
}

export default async function CatalogPage({ slug, page }: { slug?: string; page: number }) {
  const { categories, category, config, data } = await loadCatalog(slug, page);
  const copy = category ? categoryCopy(category) : { title: "Cadouri personalizate prin caligrafie", description: "Fiecare piesă este scrisă și lucrată manual, cu grijă pentru detaliu. Alege o categorie și descoperă produsele din atelier." };
  const path = slug ? `/shop/categorie/${slug}` : "/shop";
  return <div>
    <JsonLd data={breadcrumbs([{ name: "Acasă", path: "/" }, { name: "Produse", path: "/shop" }, ...(category ? [{ name: category.name, path }] : [])], config)} />
    <div className="mx-auto max-w-[1440px] px-6 pt-[84px] pb-10 text-center lg:px-12">
      <div className="mb-2 font-script text-[28px] text-olive">atelier de caligrafie</div>
      <h1 className="mb-[18px] font-serif text-[40px] font-medium lg:text-[52px]">{copy.title}</h1>
      <p className="mx-auto max-w-[680px] text-[14.5px] leading-[1.8] text-muted">{copy.description}</p>
      {page > 1 && <p className="mt-4 text-sm text-muted">Pagina {page}</p>}
    </div>
    <ShopIndex products={data.results} categories={categories} initialCategory={slug ?? null} />
    <Pagination page={page} path={path} hasNext={Boolean(data.next)} />
    <div className="mx-auto max-w-[800px] px-6 pb-20 text-center text-sm leading-7 text-muted">
      <h2 className="mb-4 font-serif text-3xl text-ink">Cum alegi un cadou personalizat?</h2>
      <p>Pe pagina fiecărui produs găsești materialele, dimensiunile, opțiunile de personalizare și timpul de producție. Verifică limita de text și alege un mesaj potrivit persoanei care îl va primi.</p>
      <Link href="/ghid-comenzi" className="avelink mt-4 inline-block border-b border-ink">Personalizare, prețuri și livrare →</Link>
    </div>
  </div>;
}
