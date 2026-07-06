"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSiteConfig, type SiteConfigData } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { formatBani } from "@/lib/money";
import { shippingAmountForSubtotal } from "@/lib/shipping";
import DeliveryNotice from "@/components/DeliveryNotice";
import FilledLink from "@/components/FilledLink";
import PhotoBox from "@/components/PhotoBox";

function RemoveIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <path d="M2 4h12M5.5 4V2.5h5V4M6 7v4.5M10 7v4.5M3.5 4l.75 9h8.5l.75-9" />
    </svg>
  );
}

export default function CartPage() {
  const { cart, loading, updateItem, removeItem } = useCart();
  const [siteConfig, setSiteConfig] = useState<SiteConfigData | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    getSiteConfig().then(setSiteConfig).catch(() => null);
  }, []);

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal_amount ?? 0;
  const shipping = siteConfig
    ? shippingAmountForSubtotal(subtotal, siteConfig)
    : null;
  const total =
    shipping !== null ? subtotal + shipping : null;

  async function handleRemove(itemId: number) {
    setRemovingId(itemId);
    try {
      await removeItem(itemId);
    } finally {
      setRemovingId(null);
    }
  }

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
                className="border-b border-ink/10 py-8"
              >
                <div className="grid grid-cols-[80px_1fr] gap-5 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-start sm:gap-7">
                  <Link href={`/shop/${item.product_slug}`} className="avelink">
                    <PhotoBox
                      asset={item.product_image}
                      aspect="1/1"
                      label="foto"
                    />
                  </Link>
                  <div className="min-w-0">
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
                  </div>
                  <div className="hidden text-right text-[15px] sm:block sm:min-w-[110px]">
                    {formatBani(item.line_total_amount, item.currency)}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 sm:mt-6 sm:justify-end sm:gap-5">
                  <div className="text-[15px] sm:hidden">
                    {formatBani(item.line_total_amount, item.currency)}
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-4 sm:ml-0">
                    <div className="flex items-center border border-ink/18">
                      <button
                        type="button"
                        onClick={() =>
                          updateItem(item.id, {
                            quantity: Math.max(1, item.quantity - 1),
                          })
                        }
                        className="h-11 w-10 cursor-pointer text-sm"
                        aria-label="Scade cantitatea"
                      >
                        –
                      </button>
                      <div className="w-9 text-center text-[13px]">
                        {item.quantity}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateItem(item.id, { quantity: item.quantity + 1 })
                        }
                        className="h-11 w-10 cursor-pointer text-sm"
                        aria-label="Crește cantitatea"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={removingId === item.id}
                      aria-label={`Elimină ${item.product_title} din coș`}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 border border-ink/25 px-5 py-2.5 text-[11px] tracking-[1.8px] text-body transition-colors hover:border-ink hover:bg-ink/[0.03] disabled:cursor-wait disabled:opacity-50"
                    >
                      <RemoveIcon />
                      {removingId === item.id ? "SE ELIMINĂ…" : "ELIMINĂ DIN COȘ"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-end gap-3">
            <div className="flex w-full max-w-[360px] justify-between text-[15px]">
              <span className="text-muted">Subtotal</span>
              <span>{formatBani(subtotal, cart?.currency)}</span>
            </div>
            <div className="flex w-full max-w-[360px] justify-between text-[15px]">
              <span className="text-muted">Livrare</span>
              <span>
                {shipping === null
                  ? "…"
                  : shipping > 0
                    ? formatBani(shipping, cart?.currency)
                    : "Gratuită"}
              </span>
            </div>
            <div className="flex w-full max-w-[360px] justify-between text-[15px] font-medium">
              <span>Total estimat</span>
              <span>
                {total !== null
                  ? formatBani(total, cart?.currency)
                  : "…"}
              </span>
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
