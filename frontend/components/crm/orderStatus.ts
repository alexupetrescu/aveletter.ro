import type { OrderStatus } from "@/lib/crm-api";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Ciornă",
  pending_payment: "Așteaptă plata",
  paid: "Plătită",
  in_production: "În producție",
  ready_to_ship: "Gata de livrare",
  shipped: "Expediată",
  completed: "Finalizată",
  cancelled: "Anulată",
  refunded: "Rambursată",
};

/** The forward path of the fulfillment pipeline. */
export const ORDER_FLOW: OrderStatus[] = [
  "pending_payment",
  "paid",
  "in_production",
  "ready_to_ship",
  "shipped",
  "completed",
];

/** Sensible next transitions per status (forward + cancel/refund exits). */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  draft: ["pending_payment", "cancelled"],
  pending_payment: ["paid", "cancelled"],
  paid: ["in_production", "cancelled", "refunded"],
  in_production: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped"],
  shipped: ["completed"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};
