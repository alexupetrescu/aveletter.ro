"use client";

import { useState } from "react";

import { CrmProductCategory } from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmDelete,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import {
  Button,
  Card,
  ConfirmDeleteButton,
  Field,
  PageHeader,
  Select,
  TextArea,
  TextInput,
  useToast,
} from "@/components/crm/ui";
import MediaPicker, { MediaThumb } from "@/components/crm/MediaPicker";

type Draft = Partial<CrmProductCategory>;

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

function CategoryForm({
  initial,
  categories,
  onSave,
  onCancel,
  busy,
}: {
  initial: Draft;
  categories: CrmProductCategory[];
  onSave: (draft: Draft) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const patch = (f: Draft) => setDraft((d) => ({ ...d, ...f }));

  return (
    <div className="bg-gold/5 border border-gold/20 rounded-sm p-4 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Nume">
          <TextInput
            value={draft.name ?? ""}
            onChange={(e) =>
              patch({
                name: e.target.value,
                slug: draft.id ? draft.slug : slugify(e.target.value),
              })
            }
          />
        </Field>
        <Field label="Slug">
          <TextInput
            value={draft.slug ?? ""}
            onChange={(e) => patch({ slug: e.target.value })}
          />
        </Field>
        <Field label="Părinte">
          <Select
            value={draft.parent ?? ""}
            onChange={(e) =>
              patch({ parent: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">— Fără —</option>
            {categories
              .filter((c) => c.id !== draft.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Ordine">
          <TextInput
            type="number"
            value={draft.sort_order ?? 0}
            onChange={(e) => patch({ sort_order: Number(e.target.value) })}
          />
        </Field>
      </div>
      <Field label="Descriere">
        <TextArea
          rows={2}
          value={draft.description ?? ""}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </Field>
      <div className="flex items-center gap-3">
        <MediaThumb
          asset={draft.image_data ?? null}
          className="w-14 h-14 rounded-sm border border-ink/10"
        />
        <Button variant="subtle" onClick={() => setPickerOpen(true)}>
          {draft.image ? "Schimbă imaginea" : "Alege imagine"}
        </Button>
        {draft.image && (
          <Button
            variant="subtle"
            onClick={() => patch({ image: null, image_data: null })}
          >
            Elimină
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button disabled={busy || !draft.name || !draft.slug} onClick={() => onSave(draft)}>
          Salvează
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Anulează
        </Button>
      </div>
      {pickerOpen && (
        <MediaPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(asset) => {
            setPickerOpen(false);
            patch({
              image: asset.id,
              image_data: asset.url
                ? { id: asset.id, url: asset.url, alt_text: asset.alt_text, title: asset.title }
                : null,
            });
          }}
        />
      )}
    </div>
  );
}

export default function CrmCategoriesPage() {
  const toast = useToast();
  const { data: categories, isLoading } =
    useCrmList<CrmProductCategory[]>("product-categories");
  const create = useCrmCreate<CrmProductCategory>("product-categories");
  const update = useCrmUpdate<CrmProductCategory>("product-categories");
  const remove = useCrmDelete("product-categories");

  const [editing, setEditing] = useState<number | "new" | null>(null);
  const busy = create.isPending || update.isPending;

  function save(draft: Draft) {
    const body = {
      name: draft.name,
      slug: draft.slug,
      parent: draft.parent ?? null,
      description: draft.description ?? "",
      image: draft.image ?? null,
      sort_order: draft.sort_order ?? 0,
    };
    const opts = {
      onSuccess: () => {
        toast("Categoria a fost salvată.");
        setEditing(null);
      },
      onError: (err: Error) => toast(err.message, "error"),
    };
    if (editing === "new") create.mutate(body, opts);
    else if (editing !== null) update.mutate({ id: editing, body }, opts);
  }

  return (
    <div>
      <PageHeader
        title="Categorii"
        subtitle="Categoriile produselor din magazin"
        actions={<Button onClick={() => setEditing("new")}>+ Categorie nouă</Button>}
      />
      <Card>
        {isLoading ? (
          <p className="text-muted text-sm">Se încarcă…</p>
        ) : (
          <div className="space-y-3">
            {editing === "new" && (
              <CategoryForm
                initial={{ sort_order: categories?.length ?? 0 }}
                categories={categories ?? []}
                onSave={save}
                onCancel={() => setEditing(null)}
                busy={busy}
              />
            )}
            {categories?.map((c) =>
              editing === c.id ? (
                <CategoryForm
                  key={c.id}
                  initial={c}
                  categories={categories}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                  busy={busy}
                />
              ) : (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-4 border border-ink/10 rounded-sm px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MediaThumb
                      asset={c.image_data}
                      className="w-10 h-10 rounded-sm border border-ink/10 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {c.name}
                        {c.parent && (
                          <span className="text-muted font-normal">
                            {" "}· sub {categories.find((p) => p.id === c.parent)?.name}
                          </span>
                        )}
                      </p>
                      <p className="text-[12px] text-muted">
                        /{c.slug} · {c.product_count} produse
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="subtle" onClick={() => setEditing(c.id)}>
                      Editează
                    </Button>
                    <ConfirmDeleteButton
                      message="Ștergi categoria? Produsele rămân, fără categorie."
                      onConfirm={() =>
                        remove.mutate(c.id, {
                          onSuccess: () => toast("Categoria a fost ștearsă."),
                          onError: (err) => toast(err.message, "error"),
                        })
                      }
                    />
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
