"use client";

import { useState } from "react";

import { CrmInputField } from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmDelete,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDeleteButton,
  Field,
  Select,
  TextInput,
  useToast,
} from "@/components/crm/ui";

const FIELD_TYPE_LABELS: Record<CrmInputField["field_type"], string> = {
  short_text: "Text scurt",
  long_text: "Text lung",
  number: "Număr",
  date: "Dată",
  email: "Email",
  file: "Fișier",
  boolean: "Da / Nu",
};

type Draft = Partial<CrmInputField>;

function numOrNull(v: string): number | null {
  return v === "" ? null : Number(v);
}

function InputFieldForm({
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
        <Field label="Cheie API" hint="ex: message_text">
          <TextInput
            value={draft.key ?? ""}
            onChange={(e) => patch({ key: e.target.value })}
          />
        </Field>
        <Field label="Etichetă">
          <TextInput
            value={draft.label ?? ""}
            onChange={(e) => patch({ label: e.target.value })}
          />
        </Field>
        <Field label="Tip">
          <Select
            value={draft.field_type ?? "short_text"}
            onChange={(e) =>
              patch({ field_type: e.target.value as CrmInputField["field_type"] })
            }
          >
            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Min. caractere">
          <TextInput
            type="number"
            min={0}
            value={draft.min_chars ?? ""}
            onChange={(e) => patch({ min_chars: numOrNull(e.target.value) })}
          />
        </Field>
        <Field label="Max. caractere">
          <TextInput
            type="number"
            min={0}
            value={draft.max_chars ?? ""}
            onChange={(e) => patch({ max_chars: numOrNull(e.target.value) })}
          />
        </Field>
        <Field label="Min. cuvinte">
          <TextInput
            type="number"
            min={0}
            value={draft.min_words ?? ""}
            onChange={(e) => patch({ min_words: numOrNull(e.target.value) })}
          />
        </Field>
        <Field label="Max. cuvinte">
          <TextInput
            type="number"
            min={0}
            value={draft.max_words ?? ""}
            onChange={(e) => patch({ max_words: numOrNull(e.target.value) })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Placeholder">
          <TextInput
            value={draft.placeholder ?? ""}
            onChange={(e) => patch({ placeholder: e.target.value })}
          />
        </Field>
        <Field label="Text ajutător">
          <TextInput
            value={draft.help_text ?? ""}
            onChange={(e) => patch({ help_text: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex items-center gap-4">
        <Checkbox
          label="Obligatoriu"
          checked={draft.required ?? false}
          onChange={(v) => patch({ required: v })}
        />
        <Button disabled={busy || !draft.key || !draft.label} onClick={() => onSave(draft)}>
          Salvează câmpul
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Anulează
        </Button>
      </div>
    </div>
  );
}

export default function InputFieldsTab({ productId }: { productId: number }) {
  const toast = useToast();
  const { data: fields, isLoading } = useCrmList<CrmInputField[]>("input-fields", {
    product: productId,
  });
  const create = useCrmCreate<CrmInputField>("input-fields");
  const update = useCrmUpdate<CrmInputField>("input-fields");
  const remove = useCrmDelete("input-fields");

  const [editing, setEditing] = useState<number | "new" | null>(null);
  const busy = create.isPending || update.isPending;

  function save(draft: Draft) {
    const body = { ...draft, product: productId };
    const opts = {
      onSuccess: () => {
        toast("Câmpul a fost salvat.");
        setEditing(null);
      },
      onError: (err: Error) => toast(err.message, "error"),
    };
    if (editing === "new") create.mutate(body, opts);
    else if (editing !== null) update.mutate({ id: editing, body }, opts);
  }

  return (
    <Card title="Câmpuri completate de client (personalizare)">
      {isLoading ? (
        <p className="text-muted text-sm">Se încarcă…</p>
      ) : (
        <div className="space-y-3">
          {fields?.map((f) =>
            editing === f.id ? (
              <InputFieldForm
                key={f.id}
                initial={f}
                onSave={save}
                onCancel={() => setEditing(null)}
                busy={busy}
              />
            ) : (
              <div
                key={f.id}
                className="flex items-center justify-between gap-4 border border-ink/10 rounded-sm px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {f.label}
                    {f.required && <span className="text-gold"> *</span>}
                  </p>
                  <p className="text-[12px] text-muted">
                    <code className="bg-ink/5 px-1 rounded-sm">{f.key}</code> ·{" "}
                    {FIELD_TYPE_LABELS[f.field_type]}
                    {f.max_words !== null && ` · max ${f.max_words} cuvinte`}
                    {f.max_chars !== null && ` · max ${f.max_chars} caractere`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="subtle" onClick={() => setEditing(f.id)}>
                    Editează
                  </Button>
                  <ConfirmDeleteButton
                    onConfirm={() =>
                      remove.mutate(f.id, {
                        onSuccess: () => toast("Câmpul a fost șters."),
                        onError: (err) => toast(err.message, "error"),
                      })
                    }
                  />
                </div>
              </div>
            ),
          )}
          {editing === "new" ? (
            <InputFieldForm
              initial={{ field_type: "short_text", sort_order: fields?.length ?? 0 }}
              onSave={save}
              onCancel={() => setEditing(null)}
              busy={busy}
            />
          ) : (
            <Button variant="subtle" onClick={() => setEditing("new")}>
              + Adaugă câmp
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
