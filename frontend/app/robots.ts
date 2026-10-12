import type { MetadataRoute } from "next";
import { getSiteConfig } from "@/lib/api";
import { absoluteUrl } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const config = await getSiteConfig().catch(() => null);
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      {
        userAgent: ["OAI-SearchBot", "GPTBot"],
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      {
        userAgent: ["ClaudeBot", "Claude-SearchBot", "Claude-User"],
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
    ],
    // Cart, checkout and CRM remain crawlable so crawlers can read their noindex headers.
    sitemap: absoluteUrl("/sitemap.xml", config),
  };
}
