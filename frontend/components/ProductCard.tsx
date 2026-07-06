import Link from "next/link";
import type { ProductListItem } from "@/lib/api";
import { formatBani } from "@/lib/money";
import PhotoBox from "./PhotoBox";

export default function ProductCard({
  product,
  showCategory = false,
}: {
  product: ProductListItem;
  showCategory?: boolean;
}) {
  const priceLabel =
    product.product_type === "text_by_page" || product.product_type === "custom_quote"
      ? "preț personalizat"
      : formatBani(product.base_price_amount, product.currency);

  const primaryCategory =
    product.categories?.find((c) => c.is_primary) ??
    product.categories?.[0] ??
    product.category;

  return (
    <Link href={`/shop/${product.slug}`} className="avelink block">
      <div className="relative mb-5">
        <PhotoBox
          asset={product.featured_image}
          label={`foto: ${product.title}`}
          aspect="4/5"
        />
        {product.is_featured && (
          <div className="absolute top-3.5 left-3.5 bg-ink px-3 py-1.5 text-[10px] tracking-[1.5px] text-paper">
            ATELIER
          </div>
        )}
      </div>
      {showCategory && primaryCategory && (
        <div className="mb-1.5 text-[10.5px] tracking-[1.5px] text-olive uppercase">
          {primaryCategory.name}
        </div>
      )}
      <h3 className="mb-2 font-serif text-[18.5px] font-medium text-ink">
        {product.title}
      </h3>
      {product.product_type === "premade" && product.availability && (
        <p className="mb-1.5 text-[12px] text-olive">
          {product.availability.label}
          {product.availability.show_quantity && (
            <span className="text-body">
              {" "}
              · {product.availability.quantity}{" "}
              {product.availability.quantity === 1 ? "buc." : "buc."}
            </span>
          )}
        </p>
      )}
      <span className="text-[13.5px] text-body">{priceLabel}</span>
    </Link>
  );
}
