import { notFound, permanentRedirect } from "next/navigation";
import CatalogPage, { catalogMetadata } from "@/components/CatalogPage";
import { pageNumber, paginatedPath } from "@/lib/seo";

type Props = { searchParams: Promise<{ categorie?: string | string[]; page?: string | string[] }> };

async function readParams(props: Props) {
  const { categorie, page: value } = await props.searchParams;
  const page = pageNumber(value);
  if (!page) notFound();
  if (categorie) {
    if (typeof categorie !== "string" || !/^[a-zA-Z0-9_-]+$/.test(categorie)) notFound();
    permanentRedirect(paginatedPath(`/shop/categorie/${categorie}`, page));
  }
  return page;
}

export async function generateMetadata(props: Props) {
  return catalogMetadata(undefined, await readParams(props));
}

export default async function ShopPage(props: Props) {
  return <CatalogPage page={await readParams(props)} />;
}
