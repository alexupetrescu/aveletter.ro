export const STOCK_STATUS_LABELS: Record<string, string> = {
  in_stock: "În stoc",
  limited: "Stoc limitat",
  on_order: "La comandă",
};

export const STOCK_STATUS_OPTIONS = [
  { value: "in_stock", label: "În stoc" },
  { value: "limited", label: "Stoc limitat" },
  { value: "on_order", label: "La comandă" },
] as const;

export type StockStatus = (typeof STOCK_STATUS_OPTIONS)[number]["value"];
