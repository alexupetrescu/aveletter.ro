import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ApiError, getProduct, getSiteConfig, ProductListItem } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import ProductConfigurator from "./ProductConfigurator";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const [product, config] = await Promise.all([
      getProduct(slug),
      getSiteConfig().catch(() => null),
    ]);
    const title =
      product.seo_title ||
      `${product.title} — Ave Letter Studio`;
    const description =
      product.seo_description ||
      product.short_description ||
      config?.default_seo_description ||
      "";
    const ogImage = product.featured_image?.url;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      },
    };
  } catch {
    return { title: "Produs — Ave Letter Studio" };
  }
}

function ProductGrid({
  title,
  products,
}: {
  title: string;
  products: ProductListItem[];
}) {
  if (products.length === 0) return null;
  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-16 lg:px-12">
      <h2 className="mb-10 text-center font-serif text-[32px] font-medium">{title}</h2>
      <div className="grid grid-cols-1 gap-[38px] sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </div>
    </div>
  );
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let product;
  let siteConfig = null;
  try {
    [product, siteConfig] = await Promise.all([
      getProduct(slug),
      getSiteConfig().catch(() => null),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const primaryCategory =
    product.categories?.find((c) => c.is_primary) ??
    product.categories?.[0] ??
    product.category;

  return (
    <div>
      {/* BREADCRUMB */}
      <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-6 pt-7 text-xs text-stone lg:px-12">
        <Link href="/" className="avelink text-stone">
          Prima pagină
        </Link>
        <span>/</span>
        {primaryCategory ? (
          <Link
            href={`/shop?categorie=${primaryCategory.slug}`}
            className="avelink text-stone"
          >
            {primaryCategory.name}
          </Link>
        ) : (
          <Link href="/shop" className="avelink text-stone">
            Produse
          </Link>
        )}
        <span>/</span>
        <span className="truncate text-body">{product.title}</span>
      </div>

      {/* PRODUCT MAIN */}
      <ProductConfigurator product={product} siteConfig={siteConfig} />

      {/* RECOMMENDATIONS */}
      <ProductGrid
        title="Completează experiența cu alte produse din atelier"
        products={product.cross_sells ?? []}
      />
    </div>
  );
}
