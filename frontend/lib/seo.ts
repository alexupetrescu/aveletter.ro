import type { Metadata } from "next";
import { getSiteConfig } from "./api";
import type { ProductDetail, SiteConfigData } from "./api";
import { resolveContact } from "./contact";

export const BRAND = "Ave Letter Studio";
export const DEFAULT_DESCRIPTION = "Cadouri și obiecte personalizate prin caligrafie, create manual într-un atelier din România.";
export const DEFAULT_IMAGE = "/images/aveletter_adinapetrescu-922x1024.jpg";

export function siteOrigin(config?: Pick<SiteConfigData, "domain"> | null): string {
  const domain = config?.domain?.trim() || "aveletter.ro";
  return new URL(domain.includes("://") ? domain : `https://${domain}`).origin;
}

export function absoluteUrl(path: string, config?: Pick<SiteConfigData, "domain"> | null) {
  return new URL(path, `${siteOrigin(config)}/`).href;
}

export function brandedTitle(title: string) {
  // Respect custom titles that already include the brand, without appending it twice.
  return /ave letter studio/i.test(title) ? title : `${title} — ${BRAND}`;
}

export async function pageMetadata({ title, description, path, image, config, noindex = false, article }: {
  title: string; description?: string; path: string; image?: string | null;
  config?: SiteConfigData | null; noindex?: boolean;
  article?: { publishedTime: string; modifiedTime?: string; authors: string[] };
}): Promise<Metadata> {
  const site = config === undefined ? await getSiteConfig().catch(() => null) : config;
  const url = absoluteUrl(path, site);
  const fullTitle = brandedTitle(title);
  const copy = description || site?.default_seo_description || DEFAULT_DESCRIPTION;
  const imageUrl = absoluteUrl(image || site?.default_og_image_url || DEFAULT_IMAGE, site);
  return {
    title: { absolute: fullTitle }, description: copy,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true, googleBot: { "max-image-preview": "large" } },
    openGraph: {
      title: fullTitle, description: copy, url, siteName: BRAND, locale: "ro_RO",
      images: [{ url: imageUrl }],
      ...(article ? { type: "article" as const, ...article } : { type: "website" as const }),
    },
    twitter: { card: "summary_large_image", title: fullTitle, description: copy, images: [imageUrl] },
  };
}

export function breadcrumbs(items: Array<{ name: string; path: string }>, config?: SiteConfigData | null) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(item.path, config),
    })),
  };
}

export function organization(config?: SiteConfigData | null) {
  const contact = resolveContact(config);
  return {
    "@context": "https://schema.org", "@type": "Organization",
    "@id": `${siteOrigin(config)}/#organization`, name: BRAND, url: siteOrigin(config),
    logo: absoluteUrl("/logo-mark.svg", config), description: config?.default_seo_description || DEFAULT_DESCRIPTION,
    email: contact.email, telephone: contact.phone,
    address: { "@type": "PostalAddress", addressLocality: "Râmnicu Vâlcea", addressCountry: "RO" },
    sameAs: [contact.instagram, contact.facebook],
  };
}

export function productSchema(product: ProductDetail, config?: SiteConfigData | null) {
  const url = absoluteUrl(`/shop/${product.slug}`, config);
  const images = [product.featured_image, ...product.gallery].filter((a) => a != null);
  const variant = product.variants[0];
  // Only emit a fixed offer when neither text nor options change the displayed price.
  // Configured/text quotes must never be advertised as free or as the base price.
  const fixedPrice = !product.text_pricing && product.product_type !== "text_by_page" &&
    product.product_type !== "custom_quote" && !product.requires_manual_approval &&
    product.option_groups.every((g) => g.options.every((o) => o.price_delta_amount === 0));
  const price = variant?.effective_price_amount ?? product.base_price_amount;
  const availability = variant?.track_stock
    ? (variant.stock_quantity > 0 ? "InStock" : "OutOfStock")
    : product.availability?.status === "in_stock" || product.availability?.status === "limited"
      ? "InStock" : undefined;
  return {
    "@context": "https://schema.org", "@type": "Product", "@id": `${url}#product`,
    name: product.title, url,
    description: product.short_description || product.description_text,
    image: [...new Set(images.map((a) => absoluteUrl(a.url, config)))],
    ...(product.sku ? { sku: product.sku } : {}),
    brand: { "@type": "Brand", name: BRAND },
    ...(fixedPrice && price > 0 ? { offers: {
      "@type": "Offer", url, price: (price / 100).toFixed(2), priceCurrency: product.currency,
      ...(availability ? { availability: `https://schema.org/${availability}` } : {}),
      seller: { "@id": `${siteOrigin(config)}/#organization` },
    } } : {}),
  };
}

export function pageNumber(value?: string | string[]): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function paginatedPath(path: string, page: number) {
  const url = new URL(path, "https://aveletter.ro");
  if (page > 1) url.searchParams.set("page", String(page));
  else url.searchParams.delete("page");
  return `${url.pathname}${url.search}`;
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
