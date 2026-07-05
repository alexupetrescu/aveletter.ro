"use client";

import { useState } from "react";

import { CrmOption, CrmOptionGroup } from "@/lib/crm-api";
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
  Select,
  TextInput,
  useToast,
} from "@/components/crm/ui";

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

type GroupDraft = Partial<CrmOptionGroup>;
type OptionDraft = Partial<CrmOption>;

function GroupForm({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial: GroupDraft;
  onSave: (draft: GroupDraft) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<GroupDraft>(initial);
  const patch = (f: GroupDraft) => setDraft((d) => ({ ...d, ...f }));

  return (
    <div className="bg-gold/5 border border-gold/20 rounded-sm p-4 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Nume grup">
          <TextInput
            value={draft.name ?? ""}
            onChange={(e) =>
              patch({ name: e.target.value, slug: draft.id ? draft.slug : slugify(e.target.value) })
            }
          />
        </Field>
        <Field label="Slug">
          <TextInput
            value={draft.slug ?? ""}
            onChange={(e) => patch({ slug: e.target.value })}
          />
        </Field>
        <Field label="Afișare">
          <Select
            value={draft.display_type ?? "select"}
            onChange={(e) =>
              patch({ display_type: e.target.value as CrmOptionGroup["display_type"] })
            }
          >
            <option value="select">Listă derulantă</option>
            <option value="radio">Radio</option>
            <option value="color">Mostre de culoare</option>
            <option value="checkbox">Bife multiple</option>
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
      <div className="flex flex-wrap items-end gap-6">
        <Checkbox
          label="Obligatoriu"
          checked={draft.required ?? false}
          onChange={(v) => patch({ required: v })}
        />
        <Field label="Selecții min" className="w-28">
          <TextInput
            type="number"
            min={0}
            value={draft.min_selections ?? 0}
            onChange={(e) => patch({ min_selections: Number(e.target.value) })}
          />
        </Field>
        <Field label="Selecții max" className="w-28">
          <TextInput
            type="number"
            min={0}
            value={draft.max_selections ?? 1}
            onChange={(e) => patch({ max_selections: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button disabled={busy || !draft.name || !draft.slug} onClick={() => onSave(draft)}>
          Salvează grupul
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Anulează
        </Button>
      </div>
    </div>
  );
}

function OptionForm({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial: OptionDraft;
  onSave: (draft: OptionDraft) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<OptionDraft>(initial);
  const patch = (f: OptionDraft) => setDraft((d) => ({ ...d, ...f }));

  return (
    <div className="bg-paper border border-gold/30 rounded-sm p-3 space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Field label="Etichetă">
          <TextInput
            value={draft.label ?? ""}
            onChange={(e) =>
              patch({ label: e.target.value, value: draft.id ? draft.value : slugify(e.target.value) })
            }
          />
        </Field>
        <Field label="Valoare">
          <TextInput
            value={draft.value ?? ""}
            onChange={(e) => patch({ value: e.target.value })}
          />
        </Field>
        <Field label="Diferență preț" hint="Poate fi negativă.">
          <MoneyInput
            value={draft.price_delta_amount ?? 0}
            onChange={(v) => patch({ price_delta_amount: v ?? 0 })}
            allowNegative
          />
        </Field>
        <Field label="Culoare (hex)" hint="Pentru mostre.">
          <TextInput
            placeholder="#C9A227"
            value={draft.color_hex ?? ""}
            onChange={(e) => patch({ color_hex: e.target.value })}
          />
        </Field>
        <Field label="Zile producție extra">
          <TextInput
            type="number"
            min={0}
            value={draft.extra_production_days ?? 0}
            onChange={(e) => patch({ extra_production_days: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="flex items-center gap-4">
        <Checkbox
          label="Activă"
          checked={draft.is_active ?? true}
          onChange={(v) => patch({ is_active: v })}
        />
        <Button disabled={busy || !draft.label || !draft.value} onClick={() => onSave(draft)}>
          Salvează opțiunea
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Anulează
        </Button>
      </div>
    </div>
  );
}

export default function OptionsTab({ productId }: { productId: number }) {
  const toast = useToast();
  const { data: groups, isLoading } = useCrmList<CrmOptionGroup[]>("option-groups", {
    product: productId,
  });

  const createGroup = useCrmCreate<CrmOptionGroup>("option-groups");
  const updateGroup = useCrmUpdate<CrmOptionGroup>("option-groups");
  const removeGroup = useCrmDelete("option-groups");
  const createOption = useCrmCreate<CrmOption>("options");
  const updateOption = useCrmUpdate<CrmOption>("options");
  const removeOption = useCrmDelete("options");

  const [editingGroup, setEditingGroup] = useState<number | "new" | null>(null);
  // "new:<groupId>" for a fresh option inside a group, or the option id.
  const [editingOption, setEditingOption] = useState<number | string | null>(null);

  const invalidateToast = (msg: string) => ({
    onSuccess: () => {
      toast(msg);
      setEditingGroup(null);
      setEditingOption(null);
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const busy =
    createGroup.isPending ||
    updateGroup.isPending ||
    createOption.isPending ||
    updateOption.isPending;

  function saveGroup(draft: GroupDraft) {
    const body = { ...draft, product: productId };
    if (editingGroup === "new") {
      createGroup.mutate(body, invalidateToast("Grupul a fost creat."));
    } else if (editingGroup !== null) {
      updateGroup.mutate({ id: editingGroup, body }, invalidateToast("Grupul a fost salvat."));
    }
  }

  function saveOption(groupId: number, draft: OptionDraft) {
    const body = { ...draft, group: groupId };
    if (typeof editingOption === "string") {
      createOption.mutate(body, invalidateToast("Opțiunea a fost creată."));
    } else if (editingOption !== null) {
      updateOption.mutate({ id: editingOption, body }, invalidateToast("Opțiunea a fost salvată."));
    }
  }

  if (isLoading) return <p className="text-muted text-sm">Se încarcă…</p>;

  return (
    <div className="space-y-5">
      {groups?.map((group) => (
        <Card key={group.id}>
          {editingGroup === group.id ? (
            <GroupForm
              initial={group}
              onSave={saveGroup}
              onCancel={() => setEditingGroup(null)}
              busy={busy}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="font-medium">
                    {group.name}
                    {group.required && <span className="text-gold"> *</span>}
                  </p>
                  <p className="text-[12px] text-muted">
                    {group.display_type} · min {group.min_selections} · max{" "}
                    {group.max_selections}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="subtle" onClick={() => setEditingGroup(group.id)}>
                    Editează grupul
                  </Button>
                  <ConfirmDeleteButton
                    message="Ștergi grupul și toate opțiunile lui?"
                    onConfirm={() =>
                      removeGroup.mutate(group.id, {
                        onSuccess: () => toast("Grupul a fost șters."),
                        onError: (err) => toast(err.message, "error"),
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                {group.options.map((opt) =>
                  editingOption === opt.id ? (
                    <OptionForm
                      key={opt.id}
                      initial={opt}
                      onSave={(d) => saveOption(group.id, d)}
                      onCancel={() => setEditingOption(null)}
                      busy={busy}
                    />
                  ) : (
                    <div
                      key={opt.id}
                      className="flex items-center justify-between gap-3 border border-ink/8 rounded-sm px-3 py-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {opt.color_hex && (
                          <span
                            className="w-4 h-4 rounded-full border border-ink/20 shrink-0"
                            style={{ backgroundColor: opt.color_hex }}
                          />
                        )}
                        <span className="text-sm truncate">
                          {opt.label}
                          {!opt.is_active && (
                            <span className="text-stone"> · inactivă</span>
                          )}
                        </span>
                        <span className="text-[12px] text-muted shrink-0">
                          {opt.price_delta_amount === 0
                            ? "+0"
                            : `${opt.price_delta_amount > 0 ? "+" : ""}${formatBani(opt.price_delta_amount)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="subtle" onClick={() => setEditingOption(opt.id)}>
                          Editează
                        </Button>
                        <ConfirmDeleteButton
                          onConfirm={() =>
                            removeOption.mutate(opt.id, {
                              onSuccess: () => toast("Opțiunea a fost ștearsă."),
                              onError: (err) => toast(err.message, "error"),
                            })
                          }
                        />
                      </div>
                    </div>
                  ),
                )}
                {editingOption === `new:${group.id}` ? (
                  <OptionForm
                    initial={{ is_active: true, sort_order: group.options.length }}
                    onSave={(d) => saveOption(group.id, d)}
                    onCancel={() => setEditingOption(null)}
                    busy={busy}
                  />
                ) : (
                  <Button variant="subtle" onClick={() => setEditingOption(`new:${group.id}`)}>
                    + Adaugă opțiune
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      ))}

      {editingGroup === "new" ? (
        <Card>
          <GroupForm
            initial={{ required: false, min_selections: 0, max_selections: 1 }}
            onSave={saveGroup}
            onCancel={() => setEditingGroup(null)}
            busy={busy}
          />
        </Card>
      ) : (
        <Button variant="subtle" onClick={() => setEditingGroup("new")}>
          + Adaugă grup de opțiuni
        </Button>
      )}
    </div>
  );
}
