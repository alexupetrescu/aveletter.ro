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

const PRICING_MODES = [
  { value: "per_page", label: "Pe pagină (prima pagină = preț de bază)" },
  { value: "per_word", label: "Pe cuvânt" },
  { value: "per_word_block", label: "Pe X cuvinte" },
  { value: "per_character", label: "Pe caracter" },
] as const;

const SETUP_HINT =
  "Se adaugă o singură dată. Dacă e 0, se folosește prețul de bază al produsului.";

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
    if (existing) {
      setDraft({
        ...existing,
        pricing_mode: existing.pricing_mode ?? "per_page",
      });
    } else
      setDraft({
        text_field_key: inputFields.find((f) => f.field_type === "long_text")?.key ?? "",
        pricing_mode: "per_page",
        words_per_page: 100,
        price_per_unit_amount: 0,
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
  const mode = draft.pricing_mode ?? "per_page";

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
    <Card title="Preț text — pe pagină, cuvânt sau caracter">
      {textFields.length === 0 ? (
        <p className="text-sm text-muted">
          Adaugă mai întâi un câmp de tip „Text lung" în tabul „Câmpuri client" —
          prețul se calculează din textul introdus de client.
        </p>
      ) : (
        <div className="space-y-4 max-w-2xl">
          <Field
            label="Câmpul cu textul tarifat"
            hint="Câmpul de personalizare din care se numără cuvintele/caracterele."
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
          <Field
            label="Mod de tarifare"
            hint="Pe pagină: prima pagină = preț de bază; paginile suplimentare se tarifează separat."
          >
            <Select
              value={mode}
              onChange={(e) =>
                patch({
                  pricing_mode: e.target.value as CrmTextPricing["pricing_mode"],
                })
              }
            >
              {PRICING_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            {mode === "per_page" && (
              <Field label="Cuvinte pe pagină">
                <TextInput
                  type="number"
                  min={1}
                  value={draft.words_per_page ?? 100}
                  onChange={(e) => patch({ words_per_page: Number(e.target.value) })}
                />
              </Field>
            )}
            {mode === "per_word_block" && (
              <Field label="Număr de cuvinte" hint="Ex.: 100 cuvinte = un bloc tarifat.">
                <TextInput
                  type="number"
                  min={1}
                  value={draft.words_per_page ?? 100}
                  onChange={(e) => patch({ words_per_page: Number(e.target.value) })}
                />
              </Field>
            )}
            <Field
              label={
                mode === "per_page"
                  ? "Preț pe pagină (suplimentară)"
                  : mode === "per_word"
                    ? "Preț pe cuvânt"
                    : mode === "per_word_block"
                      ? "Preț pentru acel număr de cuvinte (bloc suplimentar)"
                      : "Preț pe caracter"
              }
              hint={
                mode === "per_page"
                  ? "Prima pagină este inclusă în prețul de bază al produsului."
                  : mode === "per_word_block"
                    ? "Primul bloc este acoperit de taxa de pornire (sau prețul de bază dacă taxa e 0)."
                    : undefined
              }
            >
              <MoneyInput
                value={draft.price_per_unit_amount ?? 0}
                onChange={(v) => patch({ price_per_unit_amount: v ?? 0 })}
              />
            </Field>
            <Field label="Taxă de pornire" hint={SETUP_HINT}>
              <MoneyInput
                value={draft.setup_fee_amount ?? 0}
                onChange={(v) => patch({ setup_fee_amount: v ?? 0 })}
              />
            </Field>
            {mode === "per_page" && (
              <>
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
              </>
            )}
          </div>
          {(mode === "per_page" || mode === "per_word_block") && (
            <Checkbox
              label="Rotunjește în sus"
              hint={
                mode === "per_page"
                  ? "247 cuvinte la 100/pagină = 3 pagini."
                  : "247 cuvinte la 100/bloc = 3 blocuri."
              }
              checked={draft.round_up ?? true}
              onChange={(v) => patch({ round_up: v })}
            />
          )}
          <Button disabled={busy || !draft.text_field_key} onClick={save}>
            {busy ? "Se salvează…" : "Salvează configurația"}
          </Button>
        </div>
      )}
    </Card>
  );
}
