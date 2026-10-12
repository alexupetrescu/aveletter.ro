import Link from "next/link";
import type { Category, ProductListItem } from "@/lib/api";
import ProductCard from "@/components/ProductCard";

export default function ShopIndex({ products, categories, initialCategory }: {
  products: ProductListItem[]; categories: Category[]; initialCategory: string | null;
}) {
  const tabs = [{ name: "Toate", slug: null }, ...categories];
  return <>
    <nav aria-label="Categorii de produse" className="mx-auto flex max-w-[1440px] flex-wrap justify-center gap-3.5 px-6 pb-14 lg:px-12">
      {tabs.map((cat) => <Link key={cat.slug ?? "all"} href={cat.slug ? `/shop/categorie/${cat.slug}` : "/shop"}
        aria-current={initialCategory === cat.slug ? "page" : undefined}
        className={`border px-[22px] py-[11px] text-[11.5px] tracking-[1.5px] ${initialCategory === cat.slug ? "border-ink bg-ink text-paper" : "border-ink/20 bg-transparent text-body"}`}>
        {cat.name}
      </Link>)}
    </nav>
    <div className="mx-auto max-w-[1440px] px-6 pb-16 lg:px-12">
      {products.length ? <div className="grid grid-cols-1 gap-x-[38px] gap-y-11 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product) => <ProductCard key={product.slug} product={product} showCategory />)}
      </div> : <p className="py-20 text-center text-[14.5px] text-muted">Nu există încă produse în această categorie.</p>}
    </div>
  </>;
}
