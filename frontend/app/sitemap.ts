import type { MetadataRoute } from "next";
import { getAllPosts, getAllProducts, getCategories, getSiteConfig } from "@/lib/api";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fail with a server error on upstream failure rather than publishing a truncated sitemap.
  const [config, products, posts, categories] = await Promise.all([
    getSiteConfig(), getAllProducts(), getAllPosts(), getCategories(),
  ]);
  const usedCategories = new Set(products.flatMap((p) =>
    (p.categories?.length ? p.categories : p.category ? [p.category] : []).map((c) => c.slug)));
  return [
    ...["/", "/shop", "/blog", "/contact", "/ghid-comenzi"].map((path) => ({ url: absoluteUrl(path, config) })),
    ...categories.filter((c) => usedCategories.has(c.slug)).map((c) => ({ url: absoluteUrl(`/shop/categorie/${c.slug}`, config) })),
    ...products.map((p) => ({ url: absoluteUrl(`/shop/${p.slug}`, config), lastModified: p.updated_at })),
    ...posts.filter((p) => !p.noindex && (!p.canonical_url ||
      absoluteUrl(p.canonical_url, config) === absoluteUrl(`/blog/${p.slug}`, config)))
      .map((p) => ({ url: absoluteUrl(`/blog/${p.slug}`, config), lastModified: p.updated_at || p.published_at })),
  ];
}
