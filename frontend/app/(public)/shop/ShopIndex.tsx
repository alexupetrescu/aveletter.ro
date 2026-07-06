"use client";

import { useMemo, useState } from "react";
import type { Category, ProductListItem } from "@/lib/api";
import ProductCard from "@/components/ProductCard";

export default function ShopIndex({
  products,
  categories,
  initialCategory,
}: {
  products: ProductListItem[];
  categories: Category[];
  initialCategory: string | null;
}) {
  const [active, setActive] = useState<string | null>(initialCategory);

  // Only show category tabs that actually contain products.
  const usedSlugs = useMemo(
    () =>
      new Set(
        products.flatMap((p) =>
          (p.categories?.length ? p.categories : p.category ? [p.category] : [])
            .map((c) => c.slug)
            .filter(Boolean),
        ),
      ),
    [products],
  );
  const tabs = categories.filter(
    (c) => usedSlugs.has(c.slug) || c.slug === initialCategory,
  );

  const visible = active
    ? products.filter((p) => {
        const slugs = (
          p.categories?.length ? p.categories : p.category ? [p.category] : []
        ).map((c) => c.slug);
        return slugs.includes(active);
      })
    : products;

  return (
    <>
      {/* CATEGORY FILTERS */}
      <div className="mx-auto flex max-w-[1440px] flex-wrap justify-center gap-3.5 px-6 pb-14 lg:px-12">
        <button
          onClick={() => setActive(null)}
          className={`cursor-pointer border px-[22px] py-[11px] text-[11.5px] tracking-[1.5px] ${
            active === null
              ? "border-ink bg-ink text-paper"
              : "border-ink/20 bg-transparent text-body"
          }`}
        >
          Toate
        </button>
        {tabs.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => setActive(cat.slug)}
            className={`cursor-pointer border px-[22px] py-[11px] text-[11.5px] tracking-[1.5px] ${
              active === cat.slug
                ? "border-ink bg-ink text-paper"
                : "border-ink/20 bg-transparent text-body"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* PRODUCT GRID */}
      <div className="mx-auto max-w-[1440px] px-6 pb-32 lg:px-12">
        {visible.length === 0 ? (
          <p className="py-20 text-center text-[14.5px] text-muted">
            Nu există încă produse în această categorie.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-[38px] gap-y-11 sm:grid-cols-2 lg:grid-cols-4">
            {visible.map((product) => (
              <ProductCard
                key={product.slug}
                product={product}
                showCategory
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
