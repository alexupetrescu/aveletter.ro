"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSiteConfig, type SiteConfigData } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { formatBani } from "@/lib/money";
import DeliveryNotice from "@/components/DeliveryNotice";
import FilledLink from "@/components/FilledLink";
import PhotoBox from "@/components/PhotoBox";

export default function CartPage() {
  const { cart, loading, updateItem, removeItem } = useCart();
  const [siteConfig, setSiteConfig] = useState<SiteConfigData | null>(null);

  useEffect(() => {
    getSiteConfig().then(setSiteConfig).catch(() => null);
  }, []);

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal_amount ?? 0;

  return (
    <div className="mx-auto max-w-[1100px] px-6 pt-[84px] pb-32 lg:px-12">
      <div className="mb-12 text-center">
        <div className="mb-2 font-script text-[28px] text-olive">
          un pas mai aproape
        </div>
        <h1 className="font-serif text-[40px] font-medium lg:text-[52px]">
          Coșul tău
        </h1>
      </div>

      {loading ? (
        <p className="py-20 text-center text-[14.5px] text-muted">
          Se încarcă…
        </p>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-8 text-[14.5px] text-muted">
            Coșul tău este gol deocamdată.
          </p>
        <FilledLink href="/shop">VEZI PRODUSELE</FilledLink>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-0 border-t border-ink/10">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[80px_1fr_auto] items-center gap-5 border-b border-ink/10 py-6 sm:grid-cols-[96px_1fr_auto_auto] sm:gap-7"
              >
                <Link href={`/shop/${item.product_slug}`} className="avelink">
                  <PhotoBox
                    asset={item.product_image}
                    aspect="1/1"
                    label="foto"
                  />
                </Link>
                <div>
                  <Link
                    href={`/shop/${item.product_slug}`}
                    className="avelink"
                  >
                    <h3 className="mb-1 font-serif text-[19px] font-medium">
                      {item.product_title}
                    </h3>
                  </Link>
                  {item.variant_name && item.variant_name !== "Default" && (
                    <div className="text-[12.5px] text-muted">
                      {item.variant_name}
                    </div>
                  )}
                  {item.selected_option_labels.map((opt, i) => (
                    <div key={i} className="text-[12.5px] text-muted">
                      {opt.group}: {opt.label}
                    </div>
                  ))}
                  {Object.entries(item.inputs)
                    .filter(([key]) => !key.startsWith("_"))
                    .map(([key, value]) => (
                      <div
                        key={key}
                        className="max-w-[420px] truncate font-serif text-[13.5px] italic text-soft"
                      >
                        {typeof value === "object" && value !== null
                          ? `fișier: ${(value as { filename?: string }).filename ?? ""}`
                          : `„${String(value)}”`}
                      </div>
                    ))}
                  {typeof item.price_breakdown.pages === "number" && (
                    <div className="text-[12px] text-stone">
                      {String(item.price_breakdown.word_count)} cuvinte ·{" "}
                      {String(item.price_breakdown.pages)} pagini
                    </div>
                  )}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="mt-2 cursor-pointer text-[11px] tracking-[1.5px] text-stone underline-offset-2 hover:underline"
                  >
                    ELIMINĂ
                  </button>
                </div>
                <div className="flex items-center border border-ink/18">
                  <button
                    onClick={() =>
                      updateItem(item.id, {
                        quantity: Math.max(1, item.quantity - 1),
                      })
                    }
                    className="h-10 w-9 cursor-pointer text-sm"
                  >
                    –
                  </button>
                  <div className="w-8 text-center text-[13px]">
                    {item.quantity}
                  </div>
                  <button
                    onClick={() =>
                      updateItem(item.id, { quantity: item.quantity + 1 })
                    }
                    className="h-10 w-9 cursor-pointer text-sm"
                  >
                    +
                  </button>
                </div>
                <div className="col-span-3 text-right text-[15px] sm:col-span-1 sm:min-w-[110px]">
                  {formatBani(item.line_total_amount, item.currency)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-end gap-3">
            <div className="flex w-full max-w-[360px] justify-between text-[15px]">
              <span className="text-muted">Subtotal</span>
              <span>{formatBani(subtotal, cart?.currency)}</span>
            </div>
            <DeliveryNotice config={siteConfig} className="max-w-[360px] text-right" />
            <FilledLink href="/checkout" className="mt-3 px-[42px]">
              FINALIZEAZĂ COMANDA →
            </FilledLink>
          </div>
        </>
      )}
    </div>
  );
}
