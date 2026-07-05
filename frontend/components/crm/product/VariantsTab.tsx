"use client";

import { useState } from "react";

import { CrmVariant } from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmDelete,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import { formatBani } from "@/lib/money";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDeleteButton,
  Field,
  MoneyInput,
  TextInput,
  useToast,
} from "@/components/crm/ui";

type Draft = Partial<CrmVariant>;

function VariantForm({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial: Draft;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const patch = (f: Draft) => setDraft((d) => ({ ...d, ...f }));

  return (
    <div className="bg-gold/5 border border-gold/20 rounded-sm p-4 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Nume">
          <TextInput
            value={draft.name ?? ""}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field label="SKU" hint="Opțional.">
          <TextInput
            value={draft.sku ?? ""}
            onChange={(e) => patch({ sku: e.target.value || null })}
          />
        </Field>
        <Field label="Preț propriu" hint="Gol = prețul de bază.">
          <MoneyInput
            value={draft.price_override_amount ?? null}
            onChange={(v) => patch({ price_override_amount: v })}
            allowEmpty
          />
        </Field>
        <Field label="Ordine">
          <TextInput
            type="number"
            value={draft.sort_order ?? 0}
            onChange={(e) => patch({ sort_order: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <Checkbox
          label="Activă"
          checked={draft.is_active ?? true}
          onChange={(v) => patch({ is_active: v })}
        />
        <Checkbox
          label="Urmărește stocul"
          checked={draft.track_stock ?? false}
          onChange={(v) => patch({ track_stock: v })}
        />
        {draft.track_stock && (
          <Field label="Stoc" className="w-28">
            <TextInput
              type="number"
              min={0}
              value={draft.stock_quantity ?? 0}
              onChange={(e) => patch({ stock_quantity: Number(e.target.value) })}
            />
          </Field>
        )}
      </div>
      <div className="flex gap-2">
        <Button disabled={busy || !draft.name} onClick={() => onSave(draft)}>
          Salvează varianta
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Anulează
        </Button>
      </div>
    </div>
  );
}

export default function VariantsTab({ productId }: { productId: number }) {
  const toast = useToast();
  const { data: variants, isLoading } = useCrmList<CrmVariant[]>("variants", {
    product: productId,
  });
  const create = useCrmCreate<CrmVariant>("variants");
  const update = useCrmUpdate<CrmVariant>("variants");
  const remove = useCrmDelete("variants");

  const [editing, setEditing] = useState<number | "new" | null>(null);
  const busy = create.isPending || update.isPending;

  function save(draft: Draft) {
    const body = { ...draft, product: productId };
    const opts = {
      onSuccess: () => {
        toast("Varianta a fost salvată.");
        setEditing(null);
      },
      onError: (err: Error) => toast(err.message, "error"),
    };
    if (editing === "new") create.mutate(body, opts);
    else if (editing !== null) update.mutate({ id: editing, body }, opts);
  }

  return (
    <Card title="Variante (versiuni reale, cu SKU și stoc)">
      {isLoading ? (
        <p className="text-muted text-sm">Se încarcă…</p>
      ) : (
        <div className="space-y-3">
          {variants?.map((v) =>
            editing === v.id ? (
              <VariantForm
                key={v.id}
                initial={v}
                onSave={save}
                onCancel={() => setEditing(null)}
                busy={busy}
              />
            ) : (
              <div
                key={v.id}
                className="flex items-center justify-between gap-4 border border-ink/10 rounded-sm px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {v.name}
                    {!v.is_active && (
                      <span className="text-stone font-normal"> · inactivă</span>
                    )}
                  </p>
                  <p className="text-[12px] text-muted">
                    {v.sku ? `SKU ${v.sku}` : "fără SKU"}
                    {v.price_override_amount !== null &&
                      ` · ${formatBani(v.price_override_amount)}`}
                    {v.track_stock && ` · stoc: ${v.stock_quantity}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="subtle" onClick={() => setEditing(v.id)}>
                    Editează
                  </Button>
                  <ConfirmDeleteButton
                    onConfirm={() =>
                      remove.mutate(v.id, {
                        onSuccess: () => toast("Varianta a fost ștearsă."),
                        onError: (err) => toast(err.message, "error"),
                      })
                    }
                  />
                </div>
              </div>
            ),
          )}
          {editing === "new" ? (
            <VariantForm
              initial={{ is_active: true, sort_order: variants?.length ?? 0 }}
              onSave={save}
              onCancel={() => setEditing(null)}
              busy={busy}
            />
          ) : (
            <Button variant="subtle" onClick={() => setEditing("new")}>
              + Adaugă variantă
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
