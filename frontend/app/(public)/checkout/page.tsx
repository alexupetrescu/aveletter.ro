"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError, startCheckout } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { formatBani } from "@/lib/money";

const inputClass =
  "w-full border border-ink/18 bg-transparent px-3.5 py-3 text-[14px] outline-none focus:border-ink";

export default function CheckoutPage() {
  const { cart, cartKey, loading } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState({
    email: "",
    phone: "",
    full_name: "",
    county: "",
    city: "",
    postal_code: "",
    line1: "",
    line2: "",
    customer_notes: "",
  });

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal_amount ?? 0;

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cartKey) return;
    setSubmitting(true);
    setErrors([]);
    try {
      const { checkout_url } = await startCheckout(cartKey, {
        email: form.email,
        phone: form.phone,
        customer_notes: form.customer_notes,
        billing_address: {
          full_name: form.full_name,
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
      // Redirect to Stripe-hosted checkout. Payment truth comes back via webhook.
      window.location.href = checkout_url;
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
        <Link
          href="/shop"
          className="avelink inline-block bg-ink px-[34px] py-4 text-xs tracking-[2px] text-paper"
        >
          VEZI PRODUSELE
        </Link>
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
        {/* FORM */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="mb-1 text-[11px] tracking-[2px] text-olive">
            DATE DE CONTACT
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input
              type="email"
              required
              placeholder="Email *"
              value={form.email}
              onChange={set("email")}
              className={inputClass}
            />
            <input
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
          <input
            required
            placeholder="Nume complet *"
            value={form.full_name}
            onChange={set("full_name")}
            className={inputClass}
          />
          <input
            required
            placeholder="Stradă, număr *"
            value={form.line1}
            onChange={set("line1")}
            className={inputClass}
          />
          <input
            placeholder="Bloc, scară, apartament"
            value={form.line2}
            onChange={set("line2")}
            className={inputClass}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <input
              required
              placeholder="Oraș *"
              value={form.city}
              onChange={set("city")}
              className={inputClass}
            />
            <input
              placeholder="Județ"
              value={form.county}
              onChange={set("county")}
              className={inputClass}
            />
            <input
              placeholder="Cod poștal"
              value={form.postal_code}
              onChange={set("postal_code")}
              className={inputClass}
            />
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
            {submitting ? "SE REDIRECȚIONEAZĂ…" : "CONTINUĂ SPRE PLATĂ →"}
          </button>
          <p className="text-[12px] leading-[1.7] text-stone">
            Plata se face securizat prin Stripe. Vei fi redirecționat către
            pagina de plată.
          </p>
        </form>

        {/* SUMMARY */}
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
          <div className="flex justify-between pt-5 text-[15px] font-medium">
            <span>Total</span>
            <span>{formatBani(subtotal, cart?.currency)}</span>
          </div>
          <p className="mt-2 text-[12px] text-stone">
            Prețurile sunt recalculate și verificate de server înainte de
            plată.
          </p>
        </div>
      </div>
    </div>
  );
}
