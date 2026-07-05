"use client";

import { useEffect, useState } from "react";

import { CrmInputField, CrmTextPricing } from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import {
  Button,
  Card,
  Checkbox,
  Field,
  MoneyInput,
  Select,
  TextInput,
  useToast,
} from "@/components/crm/ui";

type Draft = Partial<CrmTextPricing>;

export default function TextPricingTab({
  productId,
  inputFields,
}: {
  productId: number;
  inputFields: CrmInputField[];
}) {
  const toast = useToast();
  const { data: rows, isLoading } = useCrmList<CrmTextPricing[]>("text-pricing", {
    product: productId,
  });
  const create = useCrmCreate<CrmTextPricing>("text-pricing");
  const update = useCrmUpdate<CrmTextPricing>("text-pricing");

  const existing = rows?.[0] ?? null;
  const [draft, setDraft] = useState<Draft>({});

  useEffect(() => {
    if (existing) setDraft(existing);
    else
      setDraft({
        text_field_key: inputFields.find((f) => f.field_type === "long_text")?.key ?? "",
        words_per_page: 100,
        minimum_pages: 1,
        setup_fee_amount: 0,
        round_up: true,
      });
  }, [existing, inputFields]);

  const patch = (f: Draft) => setDraft((d) => ({ ...d, ...f }));
  const busy = create.isPending || update.isPending;
  const textFields = inputFields.filter(
    (f) => f.field_type === "long_text" || f.field_type === "short_text",
  );

  function save() {
    const body = { ...draft, product: productId };
    const opts = {
      onSuccess: () => toast("Configurația de preț a fost salvată."),
      onError: (err: Error) => toast(err.message, "error"),
    };
    if (existing) update.mutate({ id: existing.id, body }, opts);
    else create.mutate(body, opts);
  }

  if (isLoading) return <p className="text-muted text-sm">Se încarcă…</p>;

  return (
    <Card title="Preț calculat pe pagină (texte, jurăminte, scrisori)">
      {textFields.length === 0 ? (
        <p className="text-sm text-muted">
          Adaugă mai întâi un câmp de tip „Text lung" în tabul „Câmpuri client" —
          prețul pe pagină se calculează din textul introdus de client.
        </p>
      ) : (
        <div className="space-y-4 max-w-2xl">
          <Field
            label="Câmpul cu textul tarifat"
            hint="Câmpul de personalizare din care se numără cuvintele."
          >
            <Select
              value={draft.text_field_key ?? ""}
              onChange={(e) => patch({ text_field_key: e.target.value })}
            >
              <option value="">— Alege câmpul —</option>
              {textFields.map((f) => (
                <option key={f.id} value={f.key}>
                  {f.label} ({f.key})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cuvinte pe pagină">
              <TextInput
                type="number"
                min={1}
                value={draft.words_per_page ?? 100}
                onChange={(e) => patch({ words_per_page: Number(e.target.value) })}
              />
            </Field>
            <Field label="Preț pe pagină">
              <MoneyInput
                value={draft.price_per_page_amount ?? 0}
                onChange={(v) => patch({ price_per_page_amount: v ?? 0 })}
              />
            </Field>
            <Field label="Taxă de pornire" hint="Se adaugă o singură dată.">
              <MoneyInput
                value={draft.setup_fee_amount ?? 0}
                onChange={(v) => patch({ setup_fee_amount: v ?? 0 })}
              />
            </Field>
            <Field label="Pagini minime">
              <TextInput
                type="number"
                min={1}
                value={draft.minimum_pages ?? 1}
                onChange={(e) => patch({ minimum_pages: Number(e.target.value) })}
              />
            </Field>
            <Field label="Pagini maxime" hint="Gol = nelimitat.">
              <TextInput
                type="number"
                min={1}
                value={draft.maximum_pages ?? ""}
                onChange={(e) =>
                  patch({
                    maximum_pages: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <Checkbox
            label="Rotunjește în sus"
            hint="247 cuvinte la 100/pagină = 3 pagini."
            checked={draft.round_up ?? true}
            onChange={(v) => patch({ round_up: v })}
          />
          <Button disabled={busy || !draft.text_field_key} onClick={save}>
            {busy ? "Se salvează…" : "Salvează configurația"}
          </Button>
        </div>
      )}
    </Card>
  );
}
