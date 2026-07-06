"use client";

import {
  isScheduledPublish,
  PUBLISH_STATUS_OPTIONS,
  PUBLISH_STATUS_STYLES,
  PublishStatus,
  publishStatusSelectValue,
} from "./publishStatus";

export default function PublishStatusSelect({
  status,
  publishedAt,
  disabled,
  compact = false,
  onClick,
  onChange,
}: {
  status: string;
  publishedAt?: string | null;
  disabled?: boolean;
  compact?: boolean;
  onClick?: React.MouseEventHandler<HTMLSelectElement>;
  onChange: (value: PublishStatus) => void;
}) {
  const scheduled = isScheduledPublish(status, publishedAt ?? null);
  const selectValue = publishStatusSelectValue(status, publishedAt ?? null);
  const resolvedStatus: PublishStatus =
    selectValue === "scheduled" ? "published" : selectValue;
  const styles = PUBLISH_STATUS_STYLES[resolvedStatus];

  return (
    <div className="relative min-w-0">
      <span
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 size-2 rounded-full ${styles.dot} ${
          compact ? "left-2" : "left-3"
        }`}
        aria-hidden
      />
      <select
        value={selectValue}
        disabled={disabled}
        onClick={onClick}
        onChange={(e) => {
          const next = e.target.value as PublishStatus | "scheduled";
          if (next === "scheduled") return;
          onChange(next);
        }}
        className={`w-full appearance-none rounded-sm border pr-8 cursor-pointer focus:outline-none focus:border-gold disabled:opacity-60 disabled:cursor-not-allowed ${
          compact ? "text-[12px] py-1 pl-6 min-w-[7.5rem]" : "text-sm py-2 pl-8"
        } ${styles.select}`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M3 4.5 6 7.5 9 4.5'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.5rem center",
        }}
      >
        {PUBLISH_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {scheduled && (
          <option value="scheduled" disabled>
            Programat
          </option>
        )}
      </select>
    </div>
  );
}
