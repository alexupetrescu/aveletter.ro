"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { OrderData } from "@/lib/api";
import { getOrder } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { formatBani } from "@/lib/money";

function SuccessContent() {
  const params = useSearchParams();
  const orderNumber = params.get("order");
  const { resetAfterCheckout } = useCart();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [notFoundOrder, setNotFoundOrder] = useState(false);

  // The success page is NOT proof of payment — it just shows the order,
  // whose status is only flipped to "paid" by the Stripe webhook.
  useEffect(() => {
    resetAfterCheckout();
    if (!orderNumber) return;
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      try {
        const data = await getOrder(orderNumber!);
        if (cancelled) return;
        setOrder(data);
        // Webhook may lag behind the redirect; poll briefly for "paid".
        if (data.status === "pending_payment" && attempts < 5) {
          attempts += 1;
          setTimeout(poll, 2000);
        }
      } catch {
        if (!cancelled) setNotFoundOrder(true);
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  const paid = order?.status && order.status !== "pending_payment" && order.status !== "draft";

  return (
    <div className="mx-auto max-w-[700px] px-6 pt-[84px] pb-32 text-center lg:px-12">
      <div className="mb-2 font-script text-[28px] text-olive">mulțumim</div>
      <h1 className="mb-6 font-serif text-[40px] font-medium">
        {paid ? "Comanda a fost plătită" : "Comanda a fost înregistrată"}
      </h1>

      {notFoundOrder ? (
        <p className="mb-8 text-[14.5px] text-muted">
          Nu am găsit comanda. Verifică emailul de confirmare.
        </p>
      ) : order ? (
        <>
          <p className="mb-2 text-[14.5px] leading-[1.8] text-muted">
            Număr comandă:{" "}
            <span className="font-medium text-ink">{order.order_number}</span>
          </p>
          <p className="mb-8 text-[14.5px] leading-[1.8] text-muted">
            {paid
              ? "Plata a fost confirmată. Vei primi detaliile pe email, iar atelierul se apucă de lucru."
              : "Așteptăm confirmarea plății de la procesator. Vei primi un email imediat ce plata este confirmată."}
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
            <div className="mt-3 flex justify-between border-t border-ink/10 pt-3 text-[15px] font-medium">
              <span>Total</span>
              <span>{formatBani(order.total_amount, order.currency)}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="mb-8 text-[14.5px] text-muted">Se încarcă…</p>
      )}

      <Link
        href="/shop"
        className="avelink inline-block bg-ink px-[34px] py-4 text-xs tracking-[2px] text-paper"
      >
        ÎNAPOI LA PRODUSE
      </Link>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
