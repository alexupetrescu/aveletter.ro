"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  CrmProductCategory,
  CrmProductDetail,
  CrmVatRate,
  TiptapDoc,
} from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmDelete,
  useCrmDetail,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDeleteButton,
  Field,
  MoneyInput,
  PageHeader,
  Select,
  TextArea,
  TextInput,
  useToast,
} from "@/components/crm/ui";
import RichTextEditor from "@/components/crm/RichTextEditor";
import PublishControls from "@/components/crm/PublishControls";
import { SaveStatusIndicator } from "@/components/crm/SaveStatusIndicator";
import MediaPicker, { MediaThumb } from "@/components/crm/MediaPicker";
import VariantsTab from "@/components/crm/product/VariantsTab";
import OptionsTab from "@/components/crm/product/OptionsTab";
import InputFieldsTab from "@/components/crm/product/InputFieldsTab";
import TextPricingTab from "@/components/crm/product/TextPricingTab";
import ImagesTab from "@/components/crm/product/ImagesTab";
import RecommendationsTab from "@/components/crm/product/RecommendationsTab";

type Draft = Partial<CrmProductDetail>;

const TABS = [
  { id: "details", label: "Detalii" },
  { id: "variants", label: "Variante" },
  { id: "options", label: "Opțiuni" },
  { id: "inputs", label: "Câmpuri client" },
  { id: "pricing", label: "Preț text" },
  { id: "images", label: "Imagini" },
  { id: "recommendations", label: "Recomandări" },
] as const;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ăâ]/g, "a")
    .replace(/î/g, "i")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function selectedCategoryIds(draft: Draft): number[] {
  if (draft.category_ids) return draft.category_ids;
  return draft.categories?.map((c) => c.id) ?? (draft.category ? [draft.category] : []);
}

function primaryCategoryId(draft: Draft): number | null {
  if (draft.primary_category_id !== undefined) return draft.primary_category_id;
  const primary = draft.categories?.find((c) => c.is_primary);
  return primary?.id ?? draft.category ?? selectedCategoryIds(draft)[0] ?? null;
}

export default function CrmProductEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const isNew = id === "new";
  const router = useRouter();
  const toast = useToast();

  const { data: product, isLoading } = useCrmDetail<CrmProductDetail>("products", id);
  const { data: categories } = useCrmList<CrmProductCategory[]>("product-categories");
  const { data: vatRates } = useCrmList<CrmVatRate[]>("vat-rates");

  const create = useCrmCreate<CrmProductDetail>("products");
  const update = useCrmUpdate<CrmProductDetail>("products");
  const remove = useCrmDelete("products");

  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("details");
  const [draft, setDraft] = useState<Draft>({});
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (product) setDraft(product);
  }, [product]);

  if (!isNew && (isLoading || !product)) {
    return <p className="text-muted text-sm">Se încarcă…</p>;
  }

  const patch = (fields: Draft) => setDraft((d) => ({ ...d, ...fields }));

  function save() {
    const body: Draft = {
      title: draft.title,
      slug: draft.slug,
      status: draft.status ?? "draft",
      published_at: draft.published_at ?? null,
      product_type: draft.product_type ?? "standard",
      sku: draft.sku || null,
      category_ids: selectedCategoryIds(draft),
      primary_category_id: primaryCategoryId(draft),
      base_price_amount: draft.base_price_amount ?? 0,
      short_description: draft.short_description ?? "",
      description: (draft.description as TiptapDoc) ?? {},
      featured_image: draft.featured_image ?? null,
      vat_rate: draft.vat_rate ?? null,
      is_featured: draft.is_featured ?? false,
      requires_manual_approval: draft.requires_manual_approval ?? false,
      production_time_min_days: draft.production_time_min_days ?? 3,
      production_time_max_days: draft.production_time_max_days ?? 10,
      seo_title: draft.seo_title ?? "",
      seo_description: draft.seo_description ?? "",
      stock_quantity: draft.stock_quantity ?? 0,
      stock_status: draft.stock_status ?? "on_order",
    };
    if (!body.title || !body.slug) {
      toast("Titlul și slug-ul sunt obligatorii.", "error");
      return;
    }
    if (isNew) {
      create.mutate(body as CrmProductDetail, {
        onSuccess: (created) => {
          toast("Produsul a fost creat.");
          router.replace(`/crm/products/${created.id}`);
        },
        onError: (err) => toast(err.message, "error"),
      });
    } else {
      update.mutate(
        { id, body },
        {
          onSuccess: () => {
            setSaved(true);
            toast("Produsul a fost salvat.");
          },
          onError: (err) => toast(err.message, "error"),
        },
      );
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <div>
      <PageHeader
        title={isNew ? "Produs nou" : (product?.title ?? "")}
        subtitle={isNew ? undefined : `/${product?.slug}`}
        actions={
          <>
            {!isNew && product && (
              <Link
                href={`/shop/${product.slug}`}
                target="_blank"
                className="avelink text-[13px] text-olive self-center mr-2"
              >
                Vezi pe site →
              </Link>
            )}
            <Link href="/crm/products" className="avelink text-[13px] text-muted self-center mr-2">
              ← Produse
            </Link>
            <SaveStatusIndicator pending={busy} saved={saved && !busy} />
            <Button onClick={save} disabled={busy}>
              {busy ? "Se salvează…" : "Salvează"}
            </Button>
          </>
        }
      />

      {!isNew && (
        <div className="flex gap-1 border-b border-ink/10 mb-6 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
          {TABS.filter(
            (t) => t.id !== "pricing" || draft.product_type === "text_by_page",
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-[13px] tracking-wide border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? "border-gold text-ink font-medium"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {(isNew || tab === "details") && (
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            <Card title="Informații de bază">
              <div className="space-y-4">
                <Field label="Titlu">
                  <TextInput
                    value={draft.title ?? ""}
                    onChange={(e) => {
                      const title = e.target.value;
                      patch(
                        slugTouched
                          ? { title }
                          : { title, slug: slugify(title) },
                      );
                    }}
                  />
                </Field>
                <Field label="Slug">
                  <TextInput
                    value={draft.slug ?? ""}
                    onChange={(e) => {
                      setSlugTouched(true);
                      patch({ slug: e.target.value });
                    }}
                  />
                </Field>
                <Field
                  label="Categorii"
                  hint="Un produs poate aparține mai multor categorii. Categoria principală apare pe site."
                >
                  <div className="space-y-2 rounded border border-ink/10 p-3">
                    {categories?.length ? (
                      categories.map((c) => {
                        const ids = selectedCategoryIds(draft);
                        const checked = ids.includes(c.id);
                        const isPrimary = primaryCategoryId(draft) === c.id;
                        return (
                          <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <Checkbox
                              label={c.name}
                              checked={checked}
                              onChange={(nextChecked) => {
                                const nextIds = nextChecked
                                  ? [...ids, c.id]
                                  : ids.filter((id) => id !== c.id);
                                const currentPrimary = primaryCategoryId(draft);
                                patch({
                                  category_ids: nextIds,
                                  primary_category_id: nextIds.includes(currentPrimary ?? -1)
                                    ? currentPrimary
                                    : nextIds[0] ?? null,
                                });
                              }}
                            />
                            {checked && (
                              <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer">
                                <input
                                  type="radio"
                                  name="primary-category"
                                  checked={isPrimary}
                                  onChange={() => patch({ primary_category_id: c.id })}
                                  className="accent-[#5a6437]"
                                />
                                Principală
                              </label>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[13px] text-muted">Nu există categorii definite.</p>
                    )}
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Tip produs" hint="Determină modul de calcul al prețului.">
                    <Select
                      value={draft.product_type ?? "standard"}
                      onChange={(e) =>
                        patch({
                          product_type: e.target.value as CrmProductDetail["product_type"],
                        })
                      }
                    >
                      <option value="standard">Standard</option>
                      <option value="premade">Pregătit (cu stoc)</option>
                      <option value="ornament">Ornament (text scurt)</option>
                      <option value="text_by_page">Text tarifat pe pagină</option>
                      <option value="custom_quote">Ofertă personalizată</option>
                    </Select>
                  </Field>
                  <Field label="Preț de bază">
                    <MoneyInput
                      value={draft.base_price_amount ?? 0}
                      onChange={(v) => patch({ base_price_amount: v ?? 0 })}
                    />
                  </Field>
                </div>
                <Field label="SKU" hint="Opțional. Cod unic al produsului.">
                  <TextInput
                    value={draft.sku ?? ""}
                    onChange={(e) => patch({ sku: e.target.value || null })}
                  />
                </Field>
                {draft.product_type === "premade" && (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Cantitate în stoc" hint="Bucăți disponibile în atelier.">
                      <TextInput
                        type="number"
                        min={0}
                        value={draft.stock_quantity ?? 0}
                        onChange={(e) =>
                          patch({ stock_quantity: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </Field>
                    <Field
                      label="Stare stoc"
                      hint="La 0 bucăți, clienții văd automat „La comandă”."
                    >
                      <Select
                        value={draft.stock_status ?? "on_order"}
                        onChange={(e) =>
                          patch({
                            stock_status: e.target.value as CrmProductDetail["stock_status"],
                          })
                        }
                      >
                        <option value="in_stock">În stoc</option>
                        <option value="limited">Stoc limitat (afișează numărul)</option>
                        <option value="on_order">La comandă</option>
                      </Select>
                    </Field>
                  </div>
                )}
                <Field label="Descriere scurtă">
                  <TextArea
                    rows={2}
                    value={draft.short_description ?? ""}
                    onChange={(e) => patch({ short_description: e.target.value })}
                  />
                </Field>
              </div>
            </Card>

            <Card title="Descriere (conținut bogat)">
              <RichTextEditor
                value={(draft.description as TiptapDoc) ?? null}
                onChange={(doc) => patch({ description: doc })}
                placeholder="Descrie produsul, materialele, procesul…"
              />
            </Card>

            <Card title="SEO">
              <div className="space-y-4">
                <Field label="Titlu SEO" hint="Max. 70 caractere.">
                  <TextInput
                    maxLength={70}
                    value={draft.seo_title ?? ""}
                    onChange={(e) => patch({ seo_title: e.target.value })}
                  />
                </Field>
                <Field label="Descriere SEO" hint="Max. 160 caractere.">
                  <TextArea
                    rows={2}
                    maxLength={160}
                    value={draft.seo_description ?? ""}
                    onChange={(e) => patch({ seo_description: e.target.value })}
                  />
                </Field>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card title="Publicare">
              <PublishControls
                status={draft.status ?? "draft"}
                publishedAt={draft.published_at ?? null}
                onChange={(p) => patch(p as Draft)}
              />
            </Card>

            <Card title="Imagine principală">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="block w-full cursor-pointer group"
              >
                <MediaThumb
                  asset={draft.featured_image_data ?? null}
                  className="w-full aspect-square rounded-sm border border-ink/10 group-hover:border-gold transition-colors"
                />
              </button>
              <div className="flex gap-2 mt-3">
                <Button variant="subtle" onClick={() => setPickerOpen(true)}>
                  Alege
                </Button>
                {draft.featured_image && (
                  <Button
                    variant="subtle"
                    onClick={() => patch({ featured_image: null, featured_image_data: null })}
                  >
                    Elimină
                  </Button>
                )}
              </div>
            </Card>

            <Card title="Setări">
              <div className="space-y-3">
                <Checkbox
                  label="Produs recomandat"
                  hint="Apare pe pagina principală."
                  checked={draft.is_featured ?? false}
                  onChange={(v) => patch({ is_featured: v })}
                />
                <Checkbox
                  label="Necesită aprobare manuală"
                  checked={draft.requires_manual_approval ?? false}
                  onChange={(v) => patch({ requires_manual_approval: v })}
                />
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <Field label="Producție min (zile)">
                    <TextInput
                      type="number"
                      min={0}
                      value={draft.production_time_min_days ?? 3}
                      onChange={(e) =>
                        patch({ production_time_min_days: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Producție max (zile)">
                    <TextInput
                      type="number"
                      min={0}
                      value={draft.production_time_max_days ?? 10}
                      onChange={(e) =>
                        patch({ production_time_max_days: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
                <Field label="Cotă TVA" hint="Gol = cota implicită a site-ului.">
                  <Select
                    value={draft.vat_rate ?? ""}
                    onChange={(e) =>
                      patch({ vat_rate: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">— Implicit —</option>
                    {vatRates?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Card>

            {!isNew && (
              <Card title="Zonă periculoasă">
                <ConfirmDeleteButton
                  label="Șterge produsul"
                  onConfirm={() =>
                    remove.mutate(id, {
                      onSuccess: () => {
                        toast("Produsul a fost șters.");
                        router.push("/crm/products");
                      },
                      onError: (err) => toast(err.message, "error"),
                    })
                  }
                />
              </Card>
            )}
          </div>
        </div>
      )}

      {!isNew && product && tab === "variants" && <VariantsTab productId={product.id} />}
      {!isNew && product && tab === "options" && <OptionsTab productId={product.id} />}
      {!isNew && product && tab === "inputs" && <InputFieldsTab productId={product.id} />}
      {!isNew && product && tab === "pricing" && (
        <TextPricingTab productId={product.id} inputFields={product.input_fields} />
      )}
      {!isNew && product && tab === "images" && <ImagesTab productId={product.id} />}
      {!isNew && product && tab === "recommendations" && (
        <RecommendationsTab productId={product.id} />
      )}

      {pickerOpen && (
        <MediaPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(asset) => {
            setPickerOpen(false);
            patch({
              featured_image: asset.id,
              featured_image_data: asset.url
                ? { id: asset.id, url: asset.url, alt_text: asset.alt_text, title: asset.title }
                : null,
            });
          }}
        />
      )}
    </div>
  );
}
