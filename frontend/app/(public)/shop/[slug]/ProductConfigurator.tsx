"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ProductDetail,
  ProductInputField,
  QuoteResponse,
} from "@/lib/api";
import { ApiError, quoteProduct, uploadCartItemFile } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { formatBani } from "@/lib/money";
import PhotoBox from "@/components/PhotoBox";
import TiptapRenderer, { hasTiptapContent } from "@/components/TiptapRenderer";

const QUOTE_DEBOUNCE_MS = 400;

function InputFieldControl({
  field,
  value,
  onChange,
  onFileChange,
}: {
  field: ProductInputField;
  value: unknown;
  onChange: (value: unknown) => void;
  onFileChange: (file: File | null) => void;
}) {
  const label = (
    <label className="mb-2.5 block text-[11px] tracking-[1.5px] text-muted uppercase">
      {field.label}
      {field.max_words ? ` (max. ${field.max_words} cuvinte)` : ""}
      {field.required ? " *" : ""}
    </label>
  );

  const underlineInput =
    "w-full border-0 border-b border-ink bg-transparent px-0.5 py-3 font-serif text-lg italic outline-none";

  switch (field.field_type) {
    case "long_text":
      return (
        <div>
          {label}
          <textarea
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={7}
            className="w-full border border-ink/18 bg-transparent p-4 font-serif text-[17px] leading-[1.8] italic outline-none focus:border-ink"
          />
          {field.help_text && (
            <p className="mt-1.5 text-xs text-stone">{field.help_text}</p>
          )}
        </div>
      );
    case "boolean":
      return (
        <label className="flex cursor-pointer items-center gap-3 text-[13.5px]">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label}
        </label>
      );
    case "file":
      return (
        <div>
          {label}
          <input
            type="file"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="w-full text-[13px]"
          />
          {field.help_text && (
            <p className="mt-1.5 text-xs text-stone">{field.help_text}</p>
          )}
          <p className="mt-1 text-xs text-stone">
            Fișierul se atașează comenzii la adăugarea în coș.
          </p>
        </div>
      );
    case "number":
    case "date":
    case "email":
      return (
        <div>
          {label}
          <input
            type={field.field_type === "number" ? "number" : field.field_type}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={underlineInput}
          />
        </div>
      );
    default:
      return (
        <div>
          {label}
          <input
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={underlineInput}
          />
          {field.help_text && (
            <p className="mt-1.5 text-xs text-stone">{field.help_text}</p>
          )}
        </div>
      );
  }
}

export default function ProductConfigurator({
  product,
}: {
  product: ProductDetail;
}) {
  const router = useRouter();
  const { cartKey, refresh } = useCart();

  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState<number | null>(
    product.variants[0]?.id ?? null,
  );
  // Preselect the first option of required single-select groups.
  const [selectedOptions, setSelectedOptions] = useState<number[]>(() =>
    product.option_groups
      .filter((g) => g.required && g.max_selections <= 1 && g.options.length)
      .map((g) => g.options[0].id),
  );
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [quantity, setQuantity] = useState(1);

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteErrors, setQuoteErrors] = useState<string[]>([]);
  const [quoting, setQuoting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addErrors, setAddErrors] = useState<string[]>([]);

  const quoteSeq = useRef(0);

  const nonFileInputs = useMemo(() => {
    const data: Record<string, unknown> = {};
    for (const field of product.input_fields) {
      if (field.field_type === "file") continue;
      if (inputs[field.key] !== undefined) data[field.key] = inputs[field.key];
    }
    return data;
  }, [inputs, product.input_fields]);

  // Server-authoritative price preview: debounce, then ask Django.
  // The client never computes pages or totals itself.
  useEffect(() => {
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const result = await quoteProduct(product.slug, {
          variant_id: variantId,
          options: selectedOptions,
          inputs: nonFileInputs,
        });
        if (quoteSeq.current !== seq) return;
        setQuote(result);
        setQuoteErrors([]);
      } catch (err) {
        if (quoteSeq.current !== seq) return;
        setQuote(null);
        setQuoteErrors(
          err instanceof ApiError && err.errors.length
            ? err.errors
            : ["Prețul nu a putut fi calculat."],
        );
      } finally {
        if (quoteSeq.current === seq) setQuoting(false);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [product.slug, variantId, selectedOptions, nonFileInputs]);

  const toggleOption = useCallback(
    (groupId: number, optionId: number, maxSelections: number) => {
      setSelectedOptions((prev) => {
        const group = product.option_groups.find((g) => g.id === groupId);
        if (!group) return prev;
        const groupOptionIds = new Set(group.options.map((o) => o.id));
        if (maxSelections <= 1) {
          // Single select: replace within group.
          return [...prev.filter((id) => !groupOptionIds.has(id)), optionId];
        }
        // Multi select: toggle.
        if (prev.includes(optionId)) {
          return prev.filter((id) => id !== optionId);
        }
        const inGroup = prev.filter((id) => groupOptionIds.has(id));
        if (maxSelections && inGroup.length >= maxSelections) return prev;
        return [...prev, optionId];
      });
    },
    [product.option_groups],
  );

  const handleAddToCart = useCallback(async () => {
    if (!cartKey) return;
    setAdding(true);
    setAddErrors([]);
    setAdded(false);
    try {
      const { addCartItem } = await import("@/lib/api");
      const cart = await addCartItem(cartKey, {
        product_slug: product.slug,
        variant_id: variantId,
        options: selectedOptions,
        inputs: nonFileInputs,
        quantity,
      });
      const newItem = cart.items.reduce(
        (latest, item) => (item.id > (latest?.id ?? -1) ? item : latest),
        cart.items[0],
      );
      // Attach any selected files to the freshly created cart item.
      for (const [fieldKey, file] of Object.entries(files)) {
        if (newItem) {
          await uploadCartItemFile(cartKey, newItem.id, fieldKey, file);
        }
      }
      await refresh();
      setAdded(true);
      router.prefetch("/cart");
    } catch (err) {
      setAddErrors(
        err instanceof ApiError && err.errors.length
          ? err.errors
          : ["Produsul nu a putut fi adăugat în coș."],
      );
    } finally {
      setAdding(false);
    }
  }, [
    cartKey,
    product.slug,
    variantId,
    selectedOptions,
    nonFileInputs,
    quantity,
    files,
    refresh,
    router,
  ]);

  const gallery = product.gallery.length
    ? product.gallery
    : product.featured_image
      ? [product.featured_image]
      : [];

  const priceDisplay = quote
    ? formatBani(quote.unit_price_amount, quote.currency)
    : product.product_type === "text_by_page"
      ? "—"
      : formatBani(product.base_price_amount, product.currency);

  const pages = quote?.breakdown.pages;
  const wordCount = quote?.breakdown.word_count;

  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-6 pt-10 pb-[110px] lg:grid-cols-2 lg:gap-20 lg:px-12">
      {/* GALLERY */}
      <div>
        {gallery.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gallery[Math.min(activeImage, gallery.length - 1)].url}
            alt={gallery[Math.min(activeImage, gallery.length - 1)].alt_text}
            className="mb-4 aspect-square w-full object-cover"
          />
        ) : (
          <PhotoBox
            aspect="1/1"
            className="mb-4"
            label={`foto principală: ${product.title}`}
          />
        )}
        <div className="grid grid-cols-3 gap-4">
          {gallery.length > 1
            ? gallery.map((asset, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={asset.url}
                  alt={asset.alt_text}
                  onClick={() => setActiveImage(i)}
                  className={`aspect-square w-full cursor-pointer object-cover ${
                    i === activeImage ? "outline outline-ink" : ""
                  }`}
                />
              ))
            : [1, 2, 3].map((n) => (
                <PhotoBox key={n} aspect="1/1" label={`foto ${n}`} />
              ))}
        </div>
      </div>

      {/* INFO + CONFIG */}
      <div>
        {product.category && (
          <div className="mb-3.5 text-[11px] tracking-[2px] text-olive uppercase">
            {product.category.name}
          </div>
        )}
        <h1 className="mb-5 font-serif text-[30px] leading-[1.2] font-medium lg:text-[38px]">
          {product.title}
        </h1>

        {/* PRICE — server-quoted only */}
        <div className="mb-7 text-[22px]">
          {priceDisplay}
          {quoting && (
            <span className="ml-3 text-[12px] text-stone">se calculează…</span>
          )}
        </div>
        {product.product_type === "text_by_page" &&
          quote &&
          wordCount !== undefined && (
            <div className="mb-6 -mt-4 text-[13px] text-muted">
              {wordCount} cuvinte · {pages}{" "}
              {pages === 1 ? "pagină" : "pagini"} caligrafiate
            </div>
          )}
        {quoteErrors.length > 0 && (
          <div className="mb-6 -mt-3 text-[13px] text-[#a03030]">
            {quoteErrors.join(" ")}
          </div>
        )}

        {product.short_description && (
          <p className="mb-4 text-[14.5px] leading-[1.9] text-soft">
            {product.short_description}
          </p>
        )}
        {hasTiptapContent(product.description) ? (
          <div className="posttext mb-[30px] text-[14.5px] leading-[1.9] text-soft [&_p]:mb-3 [&_p]:text-[14.5px] [&_p]:leading-[1.9]">
            <TiptapRenderer doc={product.description} />
          </div>
        ) : (
          product.description_text && (
            <p className="mb-[30px] text-[14.5px] leading-[1.9] text-soft">
              {product.description_text}
            </p>
          )
        )}

        {/* VARIANTS */}
        {product.variants.length > 1 && (
          <div className="mb-[26px] border-t border-ink/10 pt-[26px]">
            <div className="mb-2.5 text-[11px] tracking-[1.5px] text-muted">
              VARIANTĂ
            </div>
            <div className="flex flex-wrap gap-2.5">
              {product.variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => setVariantId(variant.id)}
                  className={`cursor-pointer border px-4 py-2.5 text-[12.5px] ${
                    variantId === variant.id
                      ? "border-ink bg-ink text-paper"
                      : "border-ink/20"
                  }`}
                >
                  {variant.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* OPTION GROUPS */}
        {product.option_groups.map((group) => {
          const groupOptionIds = new Set(group.options.map((o) => o.id));
          return (
            <div
              key={group.id}
              className="mb-[26px] border-t border-ink/10 pt-[26px]"
            >
              <div className="mb-2.5 text-[11px] tracking-[1.5px] text-muted uppercase">
                {group.name}
                {group.required ? " *" : ""}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {group.options.map((option) => {
                  const selected = selectedOptions.includes(option.id);
                  if (group.display_type === "color" && option.color_hex) {
                    return (
                      <button
                        key={option.id}
                        title={option.label}
                        onClick={() =>
                          toggleOption(group.id, option.id, group.max_selections)
                        }
                        className={`size-9 cursor-pointer rounded-full border-2 ${
                          selected ? "border-ink" : "border-ink/15"
                        }`}
                        style={{ background: option.color_hex }}
                      />
                    );
                  }
                  return (
                    <button
                      key={option.id}
                      onClick={() =>
                        toggleOption(group.id, option.id, group.max_selections)
                      }
                      className={`cursor-pointer border px-4 py-2.5 text-[12.5px] ${
                        selected ? "border-ink bg-ink text-paper" : "border-ink/20"
                      }`}
                    >
                      {option.label}
                      {option.price_delta_amount !== 0 && (
                        <span className="ml-1.5 text-[11px] opacity-70">
                          {option.price_delta_amount > 0 ? "+" : "−"}
                          {formatBani(Math.abs(option.price_delta_amount))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* INPUT FIELDS */}
        {product.input_fields.map((field) => (
          <div
            key={field.key}
            className="mb-[26px] border-t border-ink/10 pt-[26px]"
          >
            <InputFieldControl
              field={field}
              value={inputs[field.key]}
              onChange={(value) =>
                setInputs((prev) => ({ ...prev, [field.key]: value }))
              }
              onFileChange={(file) =>
                setFiles((prev) => {
                  const next = { ...prev };
                  if (file) next[field.key] = file;
                  else delete next[field.key];
                  return next;
                })
              }
            />
          </div>
        ))}

        {/* QTY + ADD TO CART */}
        <div className="mb-5 flex gap-4">
          <div className="flex items-center border border-ink/18">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-[52px] w-11 cursor-pointer text-base"
            >
              –
            </button>
            <div className="w-11 text-center text-sm">{quantity}</div>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="h-[52px] w-11 cursor-pointer text-base"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={adding || !quote}
            className="flex-1 cursor-pointer bg-ink text-xs tracking-[2px] text-paper disabled:opacity-50"
          >
            {adding ? "SE ADAUGĂ…" : "ADAUGĂ ÎN COȘ"}
          </button>
        </div>
        {added && (
          <div className="mb-4 text-[13px] text-olive">
            Adăugat în coș.{" "}
            <button
              onClick={() => router.push("/cart")}
              className="cursor-pointer border-b border-olive"
            >
              Vezi coșul →
            </button>
          </div>
        )}
        {addErrors.length > 0 && (
          <div className="mb-4 text-[13px] text-[#a03030]">
            {addErrors.join(" ")}
          </div>
        )}

        <div className="mt-9 border-t border-ink/10 pt-[26px] text-[13px] leading-8 text-muted">
          <div>
            Timp de producție: {product.production_time_min_days}–
            {product.production_time_max_days} zile lucrătoare
          </div>
          {product.category && <div>Categorie: {product.category.name}</div>}
          <div>Lucrat manual, în atelier</div>
        </div>
      </div>
    </div>
  );
}
