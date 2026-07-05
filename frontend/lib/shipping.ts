import type { SiteConfigData } from "@/lib/api";
import { formatBani } from "@/lib/money";

/** Subtotal of products only (bani). Shipping is 0 when subtotal ≥ threshold. */
export function shippingAmountForSubtotal(
  subtotal: number,
  config: Pick<
    SiteConfigData,
    "delivery_fee_amount" | "free_shipping_threshold_amount"
  > | null,
): number {
  const fee = config?.delivery_fee_amount ?? 0;
  if (!fee) return 0;
  const threshold = config?.free_shipping_threshold_amount;
  if (threshold != null && subtotal >= threshold) return 0;
  return fee;
}

export function formatDeliverySummary(
  config: Pick<
    SiteConfigData,
    "delivery_fee_amount" | "free_shipping_threshold_amount"
  > | null,
): string | null {
  if (!config) return null;
  const fee = config.delivery_fee_amount ?? 0;
  if (!fee) return null;
  const threshold = config.free_shipping_threshold_amount;
  if (threshold != null && threshold > 0) {
    return `Livrare ${formatBani(fee)}; gratuită pentru comenzi de peste ${formatBani(threshold)} (subtotal produse).`;
  }
  return `Livrare ${formatBani(fee)}.`;
}
