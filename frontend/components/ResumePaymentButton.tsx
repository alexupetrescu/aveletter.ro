"use client";

import { useState } from "react";
import { ApiError, resumeCheckout } from "@/lib/api";

interface ResumePaymentButtonProps {
  orderNumber: string;
  className?: string;
}

export default function ResumePaymentButton({
  orderNumber,
  className = "",
}: ResumePaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!orderNumber || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await resumeCheckout(orderNumber);
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }
      setError("Nu am putut deschide pagina de plată. Încearcă din nou.");
    } catch (err) {
      setError(
        err instanceof ApiError && err.errors.length
          ? err.errors.join(" ")
          : "Eroare la reluarea plății. Încearcă din nou.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={!orderNumber || loading}
        className="cursor-pointer bg-ink px-[42px] py-4 text-xs tracking-[2px] text-paper disabled:opacity-50"
      >
        {loading ? "SE PROCESEAZĂ…" : "REIA PLATA →"}
      </button>
      {error && (
        <p className="mt-3 text-[13px] text-[#a03030]">{error}</p>
      )}
    </div>
  );
}
