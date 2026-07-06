const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8020";

export interface AssetData {
  url: string;
  alt_text: string;
  width: number | null;
  height: number | null;
}

export interface Category {
  name: string;
  slug: string;
  description: string;
  image: AssetData | null;
  sort_order: number;
}

/** Nested on product payloads — no category image (see /api/shop/categories/). */
export interface ProductCategoryRef {
  name: string;
  slug: string;
  is_primary?: boolean;
}

export interface ProductAvailability {
  status: "in_stock" | "limited" | "on_order";
  label: string;
  show_quantity: boolean;
  quantity: number;
}

export interface ProductListItem {
  title: string;
  slug: string;
  product_type: "standard" | "text_by_page" | "ornament" | "custom_quote" | "premade";
  category: ProductCategoryRef | null;
  categories: ProductCategoryRef[];
  short_description: string;
  featured_image: AssetData | null;
  base_price_amount: number;
  currency: string;
  is_featured: boolean;
  availability: ProductAvailability | null;
}

export interface ProductVariant {
  id: number;
  name: string;
  sku: string | null;
  effective_price_amount: number;
  track_stock: boolean;
  stock_quantity: number;
  sort_order: number;
}

export interface ProductOption {
  id: number;
  label: string;
  value: string;
  price_delta_amount: number;
  color_hex: string;
  image: AssetData | null;
  extra_production_days: number;
  sort_order: number;
}

export interface ProductOptionGroup {
  id: number;
  name: string;
  slug: string;
  display_type: "select" | "radio" | "color" | "checkbox";
  required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  options: ProductOption[];
}

export interface ProductInputField {
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
  sort_order: number;
}

export interface ProductDetail extends ProductListItem {
  description: unknown;
  description_text: string;
  gallery: AssetData[];
  variants: ProductVariant[];
  option_groups: ProductOptionGroup[];
  input_fields: ProductInputField[];
  text_pricing: { text_field_key: string } | null;
  upsells: ProductListItem[];
  cross_sells: ProductListItem[];
  requires_manual_approval: boolean;
  production_time_min_days: number;
  production_time_max_days: number;
  seo_title: string;
  seo_description: string;
}

export interface QuoteResponse {
  unit_price_amount: number;
  currency: string;
  breakdown: {
    base_amount: number;
    option_amount: number;
    pricing_type: string;
    pricing_mode?: string;
    items: Array<Record<string, unknown>>;
    word_count?: number;
    pages?: number;
    extra_pages?: number;
    blocks?: number;
    extra_blocks?: number;
    words_per_block?: number;
    estimated_pages?: number;
    char_count?: number;
  };
  warnings: string[];
}

export interface HomeHeroData {
  tagline: string;
  title: string;
  copy: string;
  primary_button_label: string;
  primary_button_url: string;
  secondary_button_label: string;
  secondary_button_url: string;
  background_image_url: string | null;
}

export interface SiteConfigData {
  site_name: string;
  domain: string;
  contact_email: string;
  contact_phone: string;
  instagram_url: string;
  facebook_url: string;
  default_seo_title: string;
  default_seo_description: string;
  default_og_image_url: string | null;
  announcement_enabled: boolean;
  announcement_text: string;
  delivery_fee_amount: number;
  free_shipping_threshold_amount: number | null;
  maintenance_mode: boolean;
  hero: HomeHeroData;
  instagram_images: AssetData[];
}

export interface PostAuthor {
  name: string;
  photo: AssetData | null;
  bio: string;
  socials: Partial<Record<"instagram" | "facebook", string>>;
}

export interface PostListItem {
  title: string;
  slug: string;
  excerpt: string;
  reading_time: number;
  published_at: string;
  category: { name: string; slug: string; description: string } | null;
  tags: Array<{ name: string; slug: string }>;
  featured_image: AssetData | null;
  author: PostAuthor;
}

export interface PostDetail extends PostListItem {
  body: unknown;
  body_text: string;
  seo_title: string;
  seo_description: string;
}

export interface CartItemData {
  id: number;
  product_title: string;
  product_slug: string;
  product_image: AssetData | null;
  variant: number | null;
  variant_name: string | null;
  selected_option_ids: number[];
  selected_option_labels: Array<{ group: string; label: string }>;
  quantity: number;
  inputs: Record<string, unknown>;
  unit_price_amount: number;
  line_total_amount: number;
  currency: string;
  price_breakdown: QuoteResponse["breakdown"];
}

export interface CartData {
  id: number | null;
  currency: string;
  items: CartItemData[];
  subtotal_amount: number;
}

export interface OrderData {
  order_number: string;
  email: string;
  status: string;
  currency: string;
  subtotal_amount: number;
  shipping_amount: number;
  vat_amount: number;
  total_amount: number;
  placed_at: string | null;
  paid_at: string | null;
  lines: Array<{
    product_title: string;
    variant_name: string;
    quantity: number;
    unit_price_amount: number;
    line_total_amount: number;
    selected_options_snapshot: Array<{ group: string; label: string }>;
    inputs_snapshot: Record<string, unknown>;
  }>;
}

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export class ApiError extends Error {
  status: number;
  errors: string[];

  constructor(status: number, errors: string[]) {
    super(errors.join(" ") || `API error ${status}`);
    this.status = status;
    this.errors = errors;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { cartKey?: string },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (init?.cartKey) {
    headers.set("X-Cart-Key", init.cartKey);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let errors: string[] = [];
    try {
      const data = await res.json();
      if (Array.isArray(data?.errors)) errors = data.errors;
      else if (typeof data?.detail === "string") errors = [data.detail];
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, errors);
  }
  return (await res.json()) as T;
}

// ---- Catalog / blog (server-side friendly) ----

export function getCategories(): Promise<Category[]> {
  return request<Category[]>("/api/shop/categories/", {
    next: { revalidate: 60 },
  } as RequestInit);
}

export async function getProducts(params?: {
  category?: string;
  featured?: boolean;
}): Promise<ProductListItem[]> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.featured) qs.set("featured", "1");
  const suffix = qs.size ? `?${qs}` : "";
  const data = await request<Paginated<ProductListItem>>(
    `/api/shop/products/${suffix}`,
    { next: { revalidate: 60 } } as RequestInit,
  );
  return data.results;
}

export function getProduct(slug: string): Promise<ProductDetail> {
  return request<ProductDetail>(`/api/shop/products/${slug}/`, {
    next: { revalidate: 60 },
  } as RequestInit);
}

export async function getPosts(): Promise<PostListItem[]> {
  const data = await request<Paginated<PostListItem>>("/api/blog/posts/", {
    next: { revalidate: 60 },
  } as RequestInit);
  return data.results;
}

export function getPost(slug: string): Promise<PostDetail> {
  return request<PostDetail>(`/api/blog/posts/${slug}/`, {
    next: { revalidate: 60 },
  } as RequestInit);
}

export function getSiteConfig(): Promise<SiteConfigData> {
  return request<SiteConfigData>("/api/site-config/", {
    cache: "no-store",
  } as RequestInit);
}

// ---- Quote (client-side, Django-authoritative) ----

export function quoteProduct(
  slug: string,
  payload: {
    variant_id?: number | null;
    options?: number[];
    inputs?: Record<string, unknown>;
  },
): Promise<QuoteResponse> {
  return request<QuoteResponse>(`/api/shop/products/${slug}/quote/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---- Cart (client-side) ----

export function getCart(cartKey: string): Promise<CartData> {
  return request<CartData>("/api/cart/", { cartKey, cache: "no-store" });
}

export function addCartItem(
  cartKey: string,
  payload: {
    product_slug: string;
    variant_id?: number | null;
    options?: number[];
    inputs?: Record<string, unknown>;
    quantity?: number;
  },
): Promise<CartData> {
  return request<CartData>("/api/cart/items/", {
    method: "POST",
    body: JSON.stringify(payload),
    cartKey,
  });
}

export function updateCartItem(
  cartKey: string,
  itemId: number,
  payload: {
    quantity?: number;
    inputs?: Record<string, unknown>;
    options?: number[];
    variant_id?: number | null;
  },
): Promise<CartData> {
  return request<CartData>(`/api/cart/items/${itemId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    cartKey,
  });
}

export function removeCartItem(
  cartKey: string,
  itemId: number,
): Promise<CartData> {
  return request<CartData>(`/api/cart/items/${itemId}/`, {
    method: "DELETE",
    cartKey,
  });
}

export function uploadCartItemFile(
  cartKey: string,
  itemId: number,
  fieldKey: string,
  file: File,
): Promise<CartData> {
  const form = new FormData();
  form.set("field_key", fieldKey);
  form.set("file", file);
  return request<CartData>(`/api/cart/items/${itemId}/uploads/`, {
    method: "POST",
    body: form,
    cartKey,
  });
}

// ---- Checkout / orders ----

export interface AddressInput {
  full_name: string;
  phone: string;
  email?: string;
  country?: string;
  county?: string;
  city: string;
  postal_code?: string;
  line1: string;
  line2?: string;
}

export interface CheckoutStartResponse {
  order_number: string;
  payment_method: "stripe" | "ramburs";
  checkout_url?: string;
  success_url?: string;
  subtotal_amount: number;
  shipping_amount: number;
  total_amount: number;
}

export function startCheckout(
  cartKey: string,
  payload: {
    email: string;
    phone?: string;
    billing_address: AddressInput;
    shipping_address?: AddressInput;
    customer_notes?: string;
    payment_method?: "stripe" | "ramburs";
  },
): Promise<CheckoutStartResponse> {
  return request<CheckoutStartResponse>("/api/checkout/start/", {
    method: "POST",
    body: JSON.stringify(payload),
    cartKey,
  });
}

export function resumeCheckout(
  orderNumber: string,
): Promise<CheckoutStartResponse> {
  return request<CheckoutStartResponse>("/api/checkout/resume/", {
    method: "POST",
    body: JSON.stringify({ order_number: orderNumber }),
  });
}

export function getOrder(orderNumber: string): Promise<OrderData> {
  return request<OrderData>(`/api/orders/${orderNumber}/`, {
    cache: "no-store",
  });
}
