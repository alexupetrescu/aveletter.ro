import { notFound } from "next/navigation";
import CatalogPage, { catalogMetadata } from "@/components/CatalogPage";
import { pageNumber } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props) {
  const page = pageNumber((await searchParams).page);
  if (!page) notFound();
  return catalogMetadata((await params).slug, page);
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const page = pageNumber((await searchParams).page);
  if (!page) notFound();
  return <CatalogPage slug={(await params).slug} page={page} />;
}
