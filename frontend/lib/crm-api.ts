const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8020";

const CRM = `${API_BASE}/api/crm`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrmUser {
  id: number;
  username: string;
  name: string;
  is_staff: boolean;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface AssetSummary {
  id: number;
  url: string;
  alt_text: string;
  title: string;
}

export interface CrmMediaTag {
  id: number;
  name: string;
  slug: string;
}

export interface CrmMediaAsset {
  id: number;
  kind: "image" | "video" | "file";
  visibility: "public" | "private";
  url: string | null;
  original_filename: string;
  mime_type: string;
  size_bytes: number | null;
  title: string;
  alt_text: string;
  caption: string;
  credit: string;
  width: number | null;
  height: number | null;
  tags: CrmMediaTag[];
  created_at: string;
}

export interface CrmProductCategory {
  id: number;
  name: string;
  slug: string;
  parent: number | null;
  description: string;
  image: number | null;
  image_data: AssetSummary | null;
  sort_order: number;
  product_count: number;
}

export interface CrmVariant {
  id: number;
  product: number;
  name: string;
  sku: string | null;
  price_override_amount: number | null;
  is_active: boolean;
  track_stock: boolean;
  stock_quantity: number;
  sort_order: number;
}

export interface CrmOption {
  id: number;
  group: number;
  label: string;
  value: string;
  price_delta_amount: number;
  color_hex: string;
  image: number | null;
  extra_production_days: number;
  is_active: boolean;
  sort_order: number;
}

export interface CrmOptionGroup {
  id: number;
  product: number;
  name: string;
  slug: string;
  display_type: "select" | "radio" | "color" | "checkbox";
  required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  options: CrmOption[];
}

export interface CrmInputField {
  id: number;
  product: number;
  key: string;
  label: string;
  field_type:
    | "short_text"
    | "long_text"
    | "number"
    | "date"
    | "email"
    | "file"
    | "boolean";
  required: boolean;
  help_text: string;
  placeholder: string;
  min_chars: number | null;
  max_chars: number | null;
  min_words: number | null;
  max_words: number | null;
  validation_regex: string;
  sort_order: number;
}

export interface CrmProductImage {
  id: number;
  product: number;
  asset: number;
  asset_data: AssetSummary | null;
  alt_text_override: string;
  sort_order: number;
}

export interface CrmTextPricing {
  id: number;
  product: number;
  text_field_key: string;
  pricing_mode: "per_page" | "per_word" | "per_word_block" | "per_character";
  words_per_page: number;
  average_words_per_page: number | null;
  price_per_unit_amount: number;
  minimum_pages: number;
  maximum_pages: number | null;
  setup_fee_amount: number;
  round_up: boolean;
}

export interface CrmProductRecommendation {
  id: number;
  source: number;
  target: number;
  kind: "upsell" | "cross_sell";
  sort_order: number;
  target_data: {
    id: number;
    title: string;
    slug: string;
    status: string;
    base_price_amount: number;
    currency: string;
    featured_image_data: AssetSummary | null;
  };
}

export interface CrmRecommendationSuggestions {
  upsells: CrmProductList[];
  cross_sells: CrmProductList[];
}

export type TiptapDoc = Record<string, unknown>;

export interface CrmProductList {
  id: number;
  title: string;
  slug: string;
  product_type: "standard" | "text_by_page" | "ornament" | "custom_quote" | "premade";
  status: "draft" | "published" | "archived";
  publish_state: string;
  category: number | null;
  category_name: string | null;
  sku: string | null;
  base_price_amount: number;
  currency: string;
  is_featured: boolean;
  featured_image_data: AssetSummary | null;
  published_at: string | null;
  updated_at: string;
  stock_quantity: number;
  stock_status: "in_stock" | "limited" | "on_order";
}

export interface CrmProductDetail extends CrmProductList {
  short_description: string;
  description: TiptapDoc;
  description_text: string;
  featured_image: number | null;
  vat_rate: number | null;
  requires_manual_approval: boolean;
  production_time_min_days: number;
  production_time_max_days: number;
  seo_title: string;
  seo_description: string;
  variants: CrmVariant[];
  option_groups: CrmOptionGroup[];
  input_fields: CrmInputField[];
  images: CrmProductImage[];
  text_pricing: CrmTextPricing | null;
}

export interface CrmBlogCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
}

export interface CrmTag {
  id: number;
  name: string;
  slug: string;
}

export interface CrmRedirect {
  id: number;
  old_path: string;
  new_path: string;
  created_at: string;
}

export interface CrmPostList {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  publish_state: string;
  category: number | null;
  category_name: string | null;
  author_name: string;
  published_at: string | null;
  updated_at: string;
}

export interface CrmPostDetail extends CrmPostList {
  body: TiptapDoc;
  body_text: string;
  excerpt: string;
  reading_time: number;
  featured_image: number | null;
  featured_image_data: AssetSummary | null;
  og_image: number | null;
  tag_ids: number[];
  seo_title: string;
  seo_description: string;
  canonical_url: string;
  noindex: boolean;
}

export interface CrmAuthorProfile {
  id: number | null;
  user_id: number;
  user_name: string;
  photo: number | null;
  photo_data: AssetSummary | null;
  bio: string;
  instagram_url: string;
  facebook_url: string;
}

export interface CrmAddress {
  id: number;
  full_name: string;
  phone: string;
  email: string;
  country: string;
  county: string;
  city: string;
  postal_code: string;
  line1: string;
  line2: string;
}

export interface CrmOrderLine {
  id: number;
  product: number | null;
  product_title: string;
  product_slug: string;
  variant_name: string;
  sku: string;
  quantity: number;
  unit_price_amount: number;
  line_total_amount: number;
  line_net_amount: number;
  line_vat_amount: number;
  vat_rate_bp: number;
  vat_is_exempt: boolean;
  vat_legal_mention: string;
  currency: string;
  selected_options_snapshot: {
    group: string;
    label: string;
    value: string;
    price_delta_amount: number;
  }[];
  inputs_snapshot: Record<string, unknown>;
  price_breakdown: Record<string, unknown>;
  production_notes: string;
}

export interface CrmPayment {
  id: number;
  order: number;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string;
  created_at: string;
  updated_at: string;
}

export interface CrmInvoice {
  id: number;
  number_display: string;
  series_code: string;
  number: number;
  kind: string;
  order: number;
  order_number: string;
  issued_at: string;
  currency: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  snapshot: Record<string, unknown>;
  efactura_status: string;
  efactura_message: string;
  created_at: string;
}

export type OrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "in_production"
  | "ready_to_ship"
  | "shipped"
  | "completed"
  | "cancelled"
  | "refunded";

export interface CrmOrderList {
  id: number;
  order_number: string;
  email: string;
  phone: string;
  status: OrderStatus;
  currency: string;
  total_amount: number;
  placed_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface CrmOrderDetail extends CrmOrderList {
  subtotal_net_amount: number;
  subtotal_amount: number;
  shipping_amount: number;
  discount_amount: number;
  vat_amount: number;
  vat_enabled_snapshot: boolean;
  vat_breakdown: Record<string, unknown>;
  customer_notes: string;
  internal_notes: string;
  billing_address: CrmAddress | null;
  shipping_address: CrmAddress | null;
  lines: CrmOrderLine[];
  payments: CrmPayment[];
  invoices: CrmInvoice[];
}

export interface CrmVatRate {
  id: number;
  name: string;
  rate_bp: number;
  is_exempt: boolean;
  legal_mention: string;
  is_active: boolean;
}

export interface CrmTaxConfig {
  id: number;
  vat_enabled: boolean;
  prices_include_vat: boolean;
  default_vat_rate: number;
  legal_name: string;
  cui: string;
  reg_com: string;
  fiscal_address: string;
  updated_at: string;
}

export interface CrmInvoiceSeries {
  id: number;
  code: string;
  name: string;
  next_number: number;
  is_active: boolean;
}

export interface CrmSiteConfig {
  id: number;
  site_name: string;
  domain: string;
  contact_email: string;
  contact_phone: string;
  instagram_url: string;
  facebook_url: string;
  default_seo_title: string;
  default_seo_description: string;
  default_og_image: number | null;
  announcement_enabled: boolean;
  announcement_text: string;
  delivery_fee_amount: number;
  free_shipping_threshold_amount: number | null;
  maintenance_mode: boolean;
  updated_at: string;
}

export interface CrmHomeHero {
  id: number;
  background_image: number | null;
  tagline: string;
  title: string;
  copy: string;
  primary_button_label: string;
  primary_button_url: string;
  secondary_button_label: string;
  secondary_button_url: string;
  updated_at: string;
}

export interface CrmStats {
  orders_by_status: Record<string, number>;
  revenue_total: number;
  revenue_month: number;
  recent_orders: CrmOrderList[];
  low_stock: {
    id: number;
    name: string;
    stock_quantity: number;
    product__title: string;
  }[];
  counts: {
    products: number;
    posts: number;
    media: number;
    invoices: number;
  };
}

// ---------------------------------------------------------------------------
// Fetch wrapper with session credentials + CSRF
// ---------------------------------------------------------------------------

let csrfToken: string | null = null;

export class CrmApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(extractErrorMessage(status, data));
    this.status = status;
    this.data = data;
  }
}

function extractErrorMessage(status: number, data: unknown): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.errors)) return obj.errors.join(" ");
    if (typeof obj.detail === "string") return obj.detail;
    const parts: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) parts.push(`${key}: ${value.join(" ")}`);
      else if (typeof value === "string") parts.push(`${key}: ${value}`);
    }
    if (parts.length) return parts.join(" · ");
  }
  return `Eroare de server (${status}).`;
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${CRM}/auth/csrf/`, { credentials: "include" });
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken!;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  { isMutation = false }: { isMutation?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (isMutation) {
    headers.set("X-CSRFToken", await ensureCsrf());
  }
  const res = await fetch(`${CRM}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new CrmApiError(res.status, data);
  return data as T;
}

function withQuery(path: string, params?: Record<string, string | number | undefined>) {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const str = qs.toString();
  return str ? `${path}?${str}` : path;
}

export const crm = {
  get: <T>(path: string, params?: Record<string, string | number | undefined>) =>
    request<T>(withQuery(path, params)),

  post: <T>(path: string, body: unknown) =>
    request<T>(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { isMutation: true },
    ),

  patch: <T>(path: string, body: unknown) =>
    request<T>(
      path,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { isMutation: true },
    ),

  delete: (path: string) =>
    request<void>(path, { method: "DELETE" }, { isMutation: true }),

  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }, { isMutation: true }),

  uploadPatch: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "PATCH", body: form }, { isMutation: true }),
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function crmLogin(username: string, password: string): Promise<CrmUser> {
  await ensureCsrf();
  const data = await crm.post<{ user: CrmUser; csrfToken: string }>(
    "/auth/login/",
    { username, password },
  );
  csrfToken = data.csrfToken;
  return data.user;
}

export async function crmLogout(): Promise<void> {
  await crm.post("/auth/logout/", {});
  csrfToken = null;
}

export async function crmMe(): Promise<CrmUser | null> {
  const data = await request<{ user: CrmUser | null; csrfToken?: string }>(
    "/auth/me/",
  );
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data.user;
}
