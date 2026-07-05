"use client";

import { Field, Select, TextInput } from "./ui";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PublishControls({
  status,
  publishedAt,
  onChange,
}: {
  status: string;
  publishedAt: string | null;
  onChange: (patch: { status?: string; published_at?: string | null }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Stare">
        <Select
          value={status}
          onChange={(e) => onChange({ status: e.target.value })}
        >
          <option value="draft">Ciornă</option>
          <option value="published">Publicat</option>
          <option value="archived">Arhivat</option>
        </Select>
      </Field>
      <Field
        label="Data publicării"
        hint="Gol = acum. O dată viitoare programează publicarea."
      >
        <TextInput
          type="datetime-local"
          value={toLocalInput(publishedAt)}
          onChange={(e) =>
            onChange({
              published_at: e.target.value
                ? new Date(e.target.value).toISOString()
                : null,
            })
          }
        />
      </Field>
    </div>
  );
}
