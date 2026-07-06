"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import FilledLink from "@/components/FilledLink";
import ResumePaymentButton from "@/components/ResumePaymentButton";
import type { OrderData } from "@/lib/api";
import { getOrder } from "@/lib/api";
import { formatBani } from "@/lib/money";

function CancelledContent() {
  const params = useSearchParams();
  const orderNumber = params.get("order");
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(!!orderNumber);
  const [notFoundOrder, setNotFoundOrder] = useState(false);

  useEffect(() => {
    if (!orderNumber) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await getOrder(orderNumber!);
        if (!cancelled) setOrder(data);
      } catch {
        if (!cancelled) setNotFoundOrder(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orderNumber]);

  const pending = order?.status === "pending_payment";
  const paid =
    order?.status &&
    order.status !== "pending_payment" &&
    order.status !== "draft";

  return (
    <div className="mx-auto max-w-[700px] px-6 pt-[84px] pb-32 text-center lg:px-12">
      <h1 className="mb-6 font-serif text-[40px] font-medium">
        {paid ? "Comanda a fost plătită" : "Plata a fost anulată"}
      </h1>

      {loading ? (
        <p className="mb-8 text-[14.5px] text-muted">Se încarcă…</p>
      ) : notFoundOrder ? (
        <p className="mb-8 text-[14.5px] leading-[1.8] text-muted">
          Nu am găsit comanda. Verifică numărul sau emailul de confirmare.
        </p>
      ) : paid && order ? (
        <p className="mb-8 text-[14.5px] leading-[1.8] text-muted">
          Comanda{" "}
          <span className="font-medium text-ink">{order.order_number}</span>{" "}
          a fost deja plătită.
        </p>
      ) : pending && order ? (
        <>
          <p className="mb-2 text-[14.5px] leading-[1.8] text-muted">
            Număr comandă:{" "}
            <span className="font-medium text-ink">{order.order_number}</span>
          </p>
          <p className="mb-8 text-[14.5px] leading-[1.8] text-muted">
            Nu s-a efectuat nicio plată. Poți relua plata pentru comanda ta —
            produsele sunt deja rezervate în comandă.
          </p>
          <div className="mx-auto mb-10 max-w-[420px] border border-ink/10 p-6 text-left">
            {order.lines.map((line, i) => (
              <div
                key={i}
                className="flex justify-between gap-4 py-1.5 text-[13.5px]"
              >
                <span className="text-body">
                  {line.quantity} × {line.product_title}
                </span>
                <span className="whitespace-nowrap">
                  {formatBani(line.line_total_amount, order.currency)}
                </span>
              </div>
            ))}
            {order.shipping_amount > 0 && (
              <div className="flex justify-between gap-4 py-1.5 text-[13.5px] text-muted">
                <span>Livrare</span>
                <span>{formatBani(order.shipping_amount, order.currency)}</span>
              </div>
            )}
            <div className="mt-3 flex justify-between border-t border-ink/10 pt-3 text-[15px] font-medium">
              <span>Total</span>
              <span>{formatBani(order.total_amount, order.currency)}</span>
            </div>
          </div>
          <ResumePaymentButton orderNumber={order.order_number} className="mb-8" />
        </>
      ) : (
        <p className="mb-8 text-[14.5px] leading-[1.8] text-muted">
          Nu s-a efectuat nicio plată. Poți relua oricând comanda — produsele te
          așteaptă în atelier.
        </p>
      )}

      <div className="flex justify-center gap-4">
        {paid && orderNumber ? (
          <FilledLink href={`/checkout/success?order=${orderNumber}`}>
            VEZI COMANDA
          </FilledLink>
        ) : (
          <FilledLink href="/shop">ÎNAPOI LA PRODUSE</FilledLink>
        )}
        {!pending && (
          <Link
            href="/cart"
            className="avelink inline-block border border-ink px-[34px] py-4 text-xs tracking-[2px]"
          >
            VEZI COȘUL
          </Link>
        )}
      </div>
    </div>
  );
}

export default function CheckoutCancelledPage() {
  return (
    <Suspense>
      <CancelledContent />
    </Suspense>
  );
}
