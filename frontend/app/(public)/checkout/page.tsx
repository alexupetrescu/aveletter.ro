"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, getSiteConfig, startCheckout, type SiteConfigData } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { formatBani } from "@/lib/money";
import DeliveryNotice from "@/components/DeliveryNotice";
import FilledLink from "@/components/FilledLink";
import { shippingAmountForSubtotal } from "@/lib/shipping";

const inputClass =
  "w-full border border-ink/18 bg-transparent px-3.5 py-3 text-[14px] outline-none focus:border-ink";

export default function CheckoutPage() {
  const { cart, cartKey, loading } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [siteConfig, setSiteConfig] = useState<SiteConfigData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "ramburs">("stripe");
  const [form, setForm] = useState({
    email: "",
    phone: "",
    first_name: "",
    last_name: "",
    county: "",
    city: "",
    postal_code: "",
    line1: "",
    line2: "",
    customer_notes: "",
  });

  useEffect(() => {
    getSiteConfig().then(setSiteConfig).catch(() => null);
  }, []);

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal_amount ?? 0;
  const shipping = shippingAmountForSubtotal(subtotal, siteConfig);
  const total = subtotal + shipping;

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cartKey) return;
    setSubmitting(true);
    setErrors([]);
    const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
    try {
      const result = await startCheckout(cartKey, {
        email: form.email,
        phone: form.phone,
        customer_notes: form.customer_notes,
        payment_method: paymentMethod,
        billing_address: {
          full_name: fullName,
          phone: form.phone,
          email: form.email,
          country: "RO",
          county: form.county,
          city: form.city,
          postal_code: form.postal_code,
          line1: form.line1,
          line2: form.line2,
        },
      });
      if (result.payment_method === "ramburs" && result.success_url) {
        window.location.href = result.success_url;
        return;
      }
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }
      setErrors(["Comanda nu a putut fi inițiată. Încearcă din nou."]);
      setSubmitting(false);
    } catch (err) {
      setErrors(
        err instanceof ApiError && err.errors.length
          ? err.errors
          : ["Comanda nu a putut fi inițiată. Încearcă din nou."],
      );
      setSubmitting(false);
    }
  }

  if (!loading && items.length === 0) {
    return (
      <div className="mx-auto max-w-[700px] px-6 pt-[84px] pb-32 text-center lg:px-12">
        <h1 className="mb-6 font-serif text-[40px] font-medium">Comandă</h1>
        <p className="mb-8 text-[14.5px] text-muted">
          Coșul tău este gol — adaugă un produs înainte de a finaliza comanda.
        </p>
        <FilledLink href="/shop">VEZI PRODUSELE</FilledLink>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 pt-[84px] pb-32 lg:px-12">
      <div className="mb-12 text-center">
        <div className="mb-2 font-script text-[28px] text-olive">
          aproape gata
        </div>
        <h1 className="font-serif text-[40px] font-medium lg:text-[52px]">
          Finalizare comandă
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1.2fr_1fr]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="mb-1 text-[11px] tracking-[2px] text-olive">
            DATE DE CONTACT
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="Email *"
              value={form.email}
              onChange={set("email")}
              className={inputClass}
            />
            <input
              type="tel"
              name="tel"
              autoComplete="tel"
              required
              placeholder="Telefon *"
              value={form.phone}
              onChange={set("phone")}
              className={inputClass}
            />
          </div>

          <div className="mt-4 mb-1 text-[11px] tracking-[2px] text-olive">
            ADRESA DE LIVRARE
          </div>
          <p className="text-[12.5px] text-muted">
            Livrarea se face exclusiv pe teritoriul României.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input
              name="given-name"
              autoComplete="given-name"
              required
              placeholder="Prenume *"
              value={form.first_name}
              onChange={set("first_name")}
              className={inputClass}
            />
            <input
              name="family-name"
              autoComplete="family-name"
              required
              placeholder="Nume *"
              value={form.last_name}
              onChange={set("last_name")}
              className={inputClass}
            />
          </div>
          <input
            name="address-line1"
            autoComplete="address-line1"
            required
            placeholder="Stradă, număr *"
            value={form.line1}
            onChange={set("line1")}
            className={inputClass}
          />
          <input
            name="address-line2"
            autoComplete="address-line2"
            placeholder="Bloc, scară, apartament"
            value={form.line2}
            onChange={set("line2")}
            className={inputClass}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <input
              name="address-level2"
              autoComplete="address-level2"
              required
              placeholder="Oraș *"
              value={form.city}
              onChange={set("city")}
              className={inputClass}
            />
            <input
              name="address-level1"
              autoComplete="address-level1"
              placeholder="Județ"
              value={form.county}
              onChange={set("county")}
              className={inputClass}
            />
            <input
              name="postal-code"
              autoComplete="postal-code"
              placeholder="Cod poștal"
              value={form.postal_code}
              onChange={set("postal_code")}
              className={inputClass}
            />
          </div>

          <div className="mt-4 mb-1 text-[11px] tracking-[2px] text-olive">
            METODĂ DE PLATĂ
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-start gap-3 border border-ink/18 p-4 text-[13.5px]">
              <input
                type="radio"
                name="payment_method"
                checked={paymentMethod === "stripe"}
                onChange={() => setPaymentMethod("stripe")}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">Card online (Stripe)</span>
                <span className="text-muted">
                  Plată securizată — vei fi redirecționat către pagina Stripe.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 border border-ink/18 p-4 text-[13.5px]">
              <input
                type="radio"
                name="payment_method"
                checked={paymentMethod === "ramburs"}
                onChange={() => setPaymentMethod("ramburs")}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">Ramburs (plată la livrare)</span>
                <span className="text-muted">
                  Plătești curierului la primirea coletului.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-4 mb-1 text-[11px] tracking-[2px] text-olive">
            MENȚIUNI (OPȚIONAL)
          </div>
          <textarea
            rows={3}
            placeholder="Detalii pentru comandă sau livrare"
            value={form.customer_notes}
            onChange={set("customer_notes")}
            className={inputClass}
          />

          {errors.length > 0 && (
            <div className="text-[13px] text-[#a03030]">
              {errors.join(" ")}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || loading}
            className="mt-4 cursor-pointer bg-ink px-[42px] py-4 text-xs tracking-[2px] text-paper disabled:opacity-50"
          >
            {submitting
              ? "SE PROCESEAZĂ…"
              : paymentMethod === "stripe"
                ? "CONTINUĂ SPRE PLATĂ →"
                : "PLASEAZĂ COMANDA →"}
          </button>
        </form>

        <div className="h-fit border border-ink/10 p-7">
          <div className="mb-5 text-[11px] tracking-[2px] text-olive">
            SUMAR COMANDĂ
          </div>
          <div className="flex flex-col gap-4 border-b border-ink/10 pb-5">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between gap-4 text-[13.5px]">
                <span className="text-body">
                  {item.quantity} × {item.product_title}
                </span>
                <span className="whitespace-nowrap">
                  {formatBani(item.line_total_amount, item.currency)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-4 text-[13.5px]">
            <span className="text-muted">Subtotal</span>
            <span>{formatBani(subtotal, cart?.currency)}</span>
          </div>
          <div className="flex justify-between pt-2 text-[13.5px]">
            <span className="text-muted">Livrare</span>
            <span>
              {shipping > 0
                ? formatBani(shipping, cart?.currency)
                : "Gratuită"}
            </span>
          </div>
          <div className="mt-3 flex justify-between border-t border-ink/10 pt-4 text-[15px] font-medium">
            <span>Total</span>
            <span>{formatBani(total, cart?.currency)}</span>
          </div>
          <DeliveryNotice config={siteConfig} className="mt-4" />
          <p className="mt-3 text-[12px] text-stone">
            Prețurile sunt recalculate și verificate de server înainte de
            finalizare.
          </p>
        </div>
      </div>
    </div>
  );
}
