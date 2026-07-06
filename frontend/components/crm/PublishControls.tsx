"use client";

import { Field, TextInput } from "./ui";
import PublishStatusSelect from "./PublishStatusSelect";
import { PublishStatus } from "./publishStatus";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPublishedAt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const isDraft = status === "draft";
  const isArchived = status === "archived";
  const isPublished = status === "published";

  const statusHint = isDraft
    ? "Vizibil doar în CRM; clienții nu îl văd în magazin."
    : isArchived
      ? "Ascuns din magazin; poate fi republicat oricând."
      : isPublished
        ? "Produsul apare în magazin (sau la data programată)."
        : "";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
      <Field label="Stare">
        <PublishStatusSelect
          status={status}
          publishedAt={publishedAt}
          onChange={(next: PublishStatus) => onChange({ status: next })}
        />
      </Field>
      <Field
        label="Data publicării"
        hint={
          isDraft
            ? "Se activează automat la publicare."
            : isArchived
              ? "Data anterioară este păstrată."
              : "Gol = acum. O dată viitoare programează publicarea."
        }
      >
        {isDraft ? (
          <TextInput
            disabled
            value=""
            placeholder="Gol — se activează la publicare"
            className="bg-ink/5 text-muted cursor-not-allowed"
          />
        ) : isArchived ? (
          <TextInput
            disabled
            value={
              publishedAt
                ? `${formatPublishedAt(publishedAt)} (păstrată)`
                : "—"
            }
            className="bg-ink/5 text-muted cursor-not-allowed"
          />
        ) : (
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
        )}
      </Field>
      </div>
      {statusHint && (
        <p className="text-[12px] text-stone">{statusHint}</p>
      )}
    </div>
  );
}
