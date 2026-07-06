"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ProductDetail,
  ProductInputField,
  QuoteResponse,
  SiteConfigData,
} from "@/lib/api";
import { ApiError, quoteProduct, uploadCartItemFile } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { formatBani } from "@/lib/money";
import DeliveryNotice from "@/components/DeliveryNotice";
import PhotoBox from "@/components/PhotoBox";
import TiptapRenderer, { hasTiptapContent } from "@/components/TiptapRenderer";

const QUOTE_DEBOUNCE_MS = 400;

const TEXT_FIELD_TYPES = new Set(["short_text", "long_text"]);

function countWords(text: string): number {
  if (!text.trim()) return 0;
  const matches = text.match(/\b[\wăâîșțĂÂÎȘȚ'-]+\b/gu);
  return matches?.length ?? 0;
}

function truncateToMaxWords(text: string, maxWords: number): string {
  if (countWords(text) <= maxWords) return text;
  let end = text.length;
  while (end > 0 && countWords(text.slice(0, end)) > maxWords) {
    end--;
  }
  return text.slice(0, end);
}

function fieldMaxLimitMessage(
  field: ProductInputField,
  kind: "chars" | "words",
): string {
  if (kind === "chars" && field.max_chars !== null) {
    return `„${field.label}" trebuie să aibă cel mult ${field.max_chars} caractere.`;
  }
  if (kind === "words" && field.max_words !== null) {
    return `„${field.label}" trebuie să aibă cel mult ${field.max_words} cuvinte.`;
  }
  return "";
}

function applyFieldLimits(
  text: string,
  field: ProductInputField,
): { value: string; limitError: string | null } {
  let value = text;
  let limitError: string | null = null;

  if (field.max_words !== null && countWords(text) > field.max_words) {
    limitError = fieldMaxLimitMessage(field, "words");
    value = truncateToMaxWords(text, field.max_words);
  } else if (field.max_chars !== null && text.length > field.max_chars) {
    limitError = fieldMaxLimitMessage(field, "chars");
    value = text.slice(0, field.max_chars);
  }

  if (field.max_chars !== null && value.length > field.max_chars) {
    value = value.slice(0, field.max_chars);
  }

  return { value, limitError };
}

function wouldExceedFieldLimits(
  current: string,
  addition: string,
  field: ProductInputField,
): "chars" | "words" | null {
  const next = current + addition;
  if (field.max_chars !== null && next.length > field.max_chars) return "chars";
  if (field.max_words !== null && countWords(next) > field.max_words) return "words";
  return null;
}

const LIMIT_BLOCKING_KEYS = new Set([
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Tab",
  "Enter",
  "Home",
  "End",
  "Escape",
]);

function missingFieldMessage(
  field: ProductInputField,
  product: ProductDetail,
): string {
  if (
    field.field_type === "long_text" ||
    (product.text_pricing?.text_field_key === field.key &&
      product.product_type === "text_by_page")
  ) {
    return "Ai omis să ne spui ce text dorești!";
  }
  if (field.field_type === "file") {
    return `Ai omis să încarci „${field.label}".`;
  }
  return `„${field.label}" este obligatoriu.`;
}

function collectAddToCartErrors(
  product: ProductDetail,
  inputs: Record<string, unknown>,
  files: Record<string, File>,
  selectedOptions: number[],
  variantId: number | null,
): string[] {
  const errors: string[] = [];

  if (product.variants.length > 0 && variantId === null) {
    errors.push("Alege o variantă.");
  }

  for (const group of product.option_groups) {
    const count = selectedOptions.filter((id) =>
      group.options.some((o) => o.id === id),
    ).length;
    const min = group.min_selections || (group.required ? 1 : 0);
    if (count < min) {
      errors.push(`Alege o opțiune pentru „${group.name}".`);
    } else if (group.max_selections && count > group.max_selections) {
      errors.push(
        `Selectează cel mult ${group.max_selections} în „${group.name}".`,
      );
    }
  }

  for (const field of product.input_fields) {
    if (field.field_type === "file") {
      if (isMandatoryField(field, product) && !files[field.key]) {
        errors.push(missingFieldMessage(field, product));
      }
      continue;
    }

    const text = String(inputs[field.key] ?? "");
    if (isMandatoryField(field, product) && !text.trim()) {
      errors.push(missingFieldMessage(field, product));
      continue;
    }
    if (!text.trim()) continue;

    if (field.min_chars !== null && text.length < field.min_chars) {
      errors.push(
        `„${field.label}" trebuie să aibă cel puțin ${field.min_chars} caractere.`,
      );
    } else if (field.max_chars !== null && text.length > field.max_chars) {
      errors.push(
        `„${field.label}" trebuie să aibă cel mult ${field.max_chars} caractere.`,
      );
    }

    const words = countWords(text);
    if (field.min_words !== null && words < field.min_words) {
      errors.push(
        `„${field.label}" trebuie să aibă cel puțin ${field.min_words} cuvinte.`,
      );
    } else if (field.max_words !== null && words > field.max_words) {
      errors.push(
        `„${field.label}" trebuie să aibă cel mult ${field.max_words} cuvinte.`,
      );
    }
  }

  return errors;
}

function isMandatoryField(field: ProductInputField, product: ProductDetail): boolean {
  if (field.required) return true;
  if (
    TEXT_FIELD_TYPES.has(field.field_type) &&
    (product.product_type === "text_by_page" || product.product_type === "ornament")
  ) {
    return true;
  }
  if (
    product.text_pricing?.text_field_key === field.key &&
    product.product_type === "text_by_page"
  ) {
    return true;
  }
  return false;
}

function TextStatsLine({
  field,
  product,
  quote,
  quoting,
}: {
  field: ProductInputField;
  product: ProductDetail;
  quote: QuoteResponse | null;
  quoting: boolean;
}) {
  if (field.field_type !== "long_text") return null;
  if (product.product_type !== "text_by_page") return null;

  const pricingKey = product.text_pricing?.text_field_key;
  if (pricingKey && pricingKey !== field.key) return null;

  const wordCount = quote?.breakdown.word_count;
  const charCount = quote?.breakdown.char_count;
  const estimatedPages = quote?.breakdown.estimated_pages;
  const pricingMode = quote?.breakdown.pricing_mode;

  const hasStats =
    (wordCount !== undefined && wordCount > 0) ||
    (pricingMode === "per_character" && charCount !== undefined && charCount > 0) ||
    (estimatedPages !== undefined && estimatedPages > 0);

  if (quoting && !hasStats) {
    return (
      <p className="mb-2 text-[13px] text-muted">se calculează…</p>
    );
  }

  if (!hasStats) return null;

  return (
    <p className="mb-2 text-[13px] text-muted">
      {pricingMode === "per_character" && charCount !== undefined && charCount > 0 ? (
        <span>{charCount} caractere</span>
      ) : wordCount !== undefined && wordCount > 0 ? (
        <span>{wordCount} cuvinte</span>
      ) : null}
      {estimatedPages !== undefined && estimatedPages > 0 && (
        <span>
          {(pricingMode === "per_character" && charCount) ||
          (wordCount !== undefined && wordCount > 0)
            ? " · "
            : ""}
          {estimatedPages}{" "}
          {estimatedPages === 1 ? "pagină estimată" : "pagini estimate"}
        </span>
      )}
    </p>
  );
}

function InputFieldControl({
  field,
  product,
  value,
  onChange,
  onFileChange,
  quote,
  quoting,
}: {
  field: ProductInputField;
  product: ProductDetail;
  value: unknown;
  onChange: (value: unknown) => void;
  onFileChange: (file: File | null) => void;
  quote: QuoteResponse | null;
  quoting: boolean;
}) {
  const [limitError, setLimitError] = useState<string | null>(null);
  const textValue = String(value ?? "");
  const hasLimits = field.max_chars !== null || field.max_words !== null;

  const handleTextChange = (next: string) => {
    if (!hasLimits) {
      setLimitError(null);
      onChange(next);
      return;
    }
    const { value: clamped, limitError: err } = applyFieldLimits(next, field);
    setLimitError(err);
    onChange(clamped);
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!hasLimits || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return;
    if (LIMIT_BLOCKING_KEYS.has(e.key)) return;
    if (e.key.length !== 1) return;

    const exceeded = wouldExceedFieldLimits(textValue, e.key, field);
    if (exceeded) {
      e.preventDefault();
      setLimitError(fieldMaxLimitMessage(field, exceeded));
    }
  };

  const limitHint = limitError && (
    <p className="mt-1.5 text-xs text-[#a03030]">{limitError}</p>
  );

  const mandatory = isMandatoryField(field, product);
  const label = (
    <label className="mb-2.5 block text-[11px] tracking-[1.5px] text-muted uppercase">
      {field.label}
      {field.min_words ? ` (min. ${field.min_words} cuvinte)` : ""}
      {field.max_words ? ` (max. ${field.max_words} cuvinte)` : ""}
      {field.max_chars ? ` (max. ${field.max_chars} caractere)` : ""}
      {mandatory ? " *" : ""}
    </label>
  );

  const underlineInput =
    "w-full border-0 border-b border-ink bg-transparent px-0.5 py-3 font-serif text-lg italic outline-none";

  switch (field.field_type) {
    case "long_text":
      return (
        <div>
          {label}
          <TextStatsLine
            field={field}
            product={product}
            quote={quote}
            quoting={quoting}
          />
          <textarea
            value={textValue}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleTextKeyDown}
            placeholder={field.placeholder}
            rows={7}
            required={mandatory}
            className="w-full border border-ink/18 bg-transparent p-4 font-serif text-[17px] leading-[1.8] italic outline-none focus:border-ink"
          />
          {field.help_text && !limitError && (
            <p className="mt-1.5 text-xs text-stone">{field.help_text}</p>
          )}
          {limitHint}
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
            value={textValue}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleTextKeyDown}
            placeholder={field.placeholder}
            required={mandatory}
            className={underlineInput}
          />
          {limitHint}
        </div>
      );
    default:
      return (
        <div>
          {label}
          <input
            value={textValue}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleTextKeyDown}
            placeholder={field.placeholder}
            required={mandatory}
            className={underlineInput}
          />
          {field.help_text && !limitError && (
            <p className="mt-1.5 text-xs text-stone">{field.help_text}</p>
          )}
          {limitHint}
        </div>
      );
  }
}

export default function ProductConfigurator({
  product,
  siteConfig,
}: {
  product: ProductDetail;
  siteConfig: SiteConfigData | null;
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
  const [showAddedBanner, setShowAddedBanner] = useState(false);
  const [addErrors, setAddErrors] = useState<string[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const quoteSeq = useRef(0);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
  }, []);

  const nonFileInputs = useMemo(() => {
    const data: Record<string, unknown> = {};
    for (const field of product.input_fields) {
      if (field.field_type === "file") continue;
      if (inputs[field.key] !== undefined) data[field.key] = inputs[field.key];
    }
    return data;
  }, [inputs, product.input_fields]);

  const productCategories = useMemo(() => {
    if (product.categories?.length) return product.categories;
    return product.category ? [product.category] : [];
  }, [product.categories, product.category]);

  const primaryCategory = useMemo(
    () => productCategories.find((c) => c.is_primary) ?? productCategories[0] ?? null,
    [productCategories],
  );

  const categoryLabel = useMemo(
    () => productCategories.map((c) => c.name).join(", "),
    [productCategories],
  );

  const validationErrors = useMemo(
    () =>
      collectAddToCartErrors(
        product,
        inputs,
        files,
        selectedOptions,
        variantId,
      ),
    [product, inputs, files, selectedOptions, variantId],
  );

  const blockingErrors = useMemo(
    () => [...validationErrors, ...quoteErrors],
    [validationErrors, quoteErrors],
  );

  const visibleErrors = addErrors.length > 0
    ? addErrors
    : submitAttempted
      ? blockingErrors
      : quoteErrors;

  useEffect(() => {
    setAddErrors([]);
  }, [inputs, files, selectedOptions, variantId]);

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
    setSubmitAttempted(true);

    const clientErrors = collectAddToCartErrors(
      product,
      inputs,
      files,
      selectedOptions,
      variantId,
    );
    if (clientErrors.length) {
      setAddErrors(clientErrors);
      return;
    }
    if (quoteErrors.length) {
      setAddErrors(quoteErrors);
      return;
    }
    if (!quote) {
      setAddErrors(["Prețul nu a putut fi calculat."]);
      return;
    }

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
      setShowAddedBanner(true);
      setQuantity(1);
      router.prefetch("/cart");
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
      addedTimerRef.current = setTimeout(() => {
        setAdded(false);
        setShowAddedBanner(false);
      }, 4000);
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
    product,
    inputs,
    files,
    selectedOptions,
    variantId,
    quoteErrors,
    quote,
    nonFileInputs,
    quantity,
    refresh,
    router,
  ]);

  const gallery = useMemo(() => {
    const images = [];
    if (product.featured_image) images.push(product.featured_image);
    for (const asset of product.gallery) {
      if (!images.some((img) => img.url === asset.url)) images.push(asset);
    }
    return images;
  }, [product.featured_image, product.gallery]);

  const priceDisplay = quote
    ? formatBani(quote.unit_price_amount, quote.currency)
    : formatBani(
        product.variants.find((v) => v.id === variantId)?.effective_price_amount ??
          product.base_price_amount,
        product.currency,
      );

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
        {gallery.length > 1 && (
          <div className="grid grid-cols-3 gap-4">
            {gallery.map((asset, i) => (
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
            ))}
          </div>
        )}
      </div>

      {/* INFO + CONFIG */}
      <div>
        {primaryCategory && (
          <div className="mb-3.5 text-[11px] tracking-[2px] text-olive uppercase">
            {primaryCategory.name}
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
        {product.product_type === "premade" && product.availability && (
          <div className="mb-6 -mt-4 text-[13px] text-olive">
            {product.availability.label}
            {product.availability.show_quantity && (
              <span className="text-muted">
                {" "}
                · {product.availability.quantity}{" "}
                {product.availability.quantity === 1 ? "bucată" : "bucăți"}
              </span>
            )}
          </div>
        )}
        {quoteErrors.length > 0 && !submitAttempted && (
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
                      className={`flex cursor-pointer items-center gap-2 border px-4 py-2.5 text-[12.5px] ${
                        selected ? "border-ink bg-ink text-paper" : "border-ink/20"
                      }`}
                    >
                      {option.color_hex && (
                        <span
                          className={`size-3.5 shrink-0 rounded-full border ${
                            selected ? "border-paper/40" : "border-ink/20"
                          }`}
                          style={{ backgroundColor: option.color_hex }}
                          aria-hidden
                        />
                      )}
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
              product={product}
              value={inputs[field.key]}
              quote={quote}
              quoting={quoting}
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
        {showAddedBanner && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-olive/30 bg-olive/8 px-4 py-3 text-[13px]">
            <span className="text-olive">Produs adăugat în coș.</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setShowAddedBanner(false)}
                className="cursor-pointer text-muted underline-offset-2 hover:underline"
              >
                Continuă cumpărăturile
              </button>
              <Link
                href="/cart"
                className="font-medium text-ink underline-offset-2 hover:underline"
              >
                Mergi la coș →
              </Link>
            </div>
          </div>
        )}
        {visibleErrors.length > 0 && (
          <div
            className="mb-4 border border-[#a03030]/25 bg-[#a03030]/5 px-4 py-3 text-[13px] leading-relaxed text-[#a03030]"
            role="alert"
          >
            {visibleErrors.map((err, i) => (
              <p key={i}>{err}</p>
            ))}
          </div>
        )}
        <div className="mb-5 flex gap-4">
          <div className="flex items-center border border-ink/18">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={added}
              className="h-[52px] w-11 cursor-pointer text-base disabled:opacity-40"
            >
              –
            </button>
            <div className="w-11 text-center text-sm">{quantity}</div>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              disabled={added}
              className="h-[52px] w-11 cursor-pointer text-base disabled:opacity-40"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={adding || added}
            className={`flex-1 cursor-pointer text-xs tracking-[2px] disabled:opacity-50 ${
              added
                ? "bg-olive text-paper"
                : "bg-ink text-paper"
            }`}
          >
            {adding
              ? "SE ADAUGĂ…"
              : added
                ? "✓ ADĂUGAT ÎN COȘ"
                : "ADAUGĂ ÎN COȘ"}
          </button>
        </div>

        <DeliveryNotice config={siteConfig} className="mb-6" />

        <div className="mt-9 border-t border-ink/10 pt-[26px] text-[13px] leading-8 text-muted">
          <div>
            Timp de producție: {product.production_time_min_days}–
            {product.production_time_max_days} zile lucrătoare
          </div>
          {categoryLabel && <div>Categorii: {categoryLabel}</div>}
          <div>Lucrat manual, în atelier</div>
        </div>
      </div>
    </div>
  );
}
