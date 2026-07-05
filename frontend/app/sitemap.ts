import type { MetadataRoute } from "next";
import { getPosts, getProducts, getSiteConfig } from "@/lib/api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let domain = "aveletter.ro";
  try {
    const config = await getSiteConfig();
    domain = config.domain || domain;
  } catch {
    // use default
  }
  const base = `https://${domain}`;

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
  ];

  let productPages: MetadataRoute.Sitemap = [];
  let blogPages: MetadataRoute.Sitemap = [];

  try {
    const products = await getProducts();
    productPages = products.map((p) => ({
      url: `${base}/shop/${p.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    // skip
  }

  try {
    const posts = await getPosts();
    blogPages = posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // skip
  }

  return [...staticPages, ...productPages, ...blogPages];
}
