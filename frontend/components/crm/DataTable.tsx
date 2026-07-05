"use client";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Caută…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border border-ink/15 rounded-sm px-3 py-2 text-sm bg-white/70 focus:outline-none focus:border-gold w-full sm:w-64 max-w-full"
    />
  );
}

export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value === value ? "" : opt.value)}
          className={`px-3 py-1.5 rounded-full text-[12px] tracking-wide border transition-colors cursor-pointer ${
            opt.value === value
              ? "bg-ink text-paper border-ink"
              : "border-ink/15 text-muted hover:border-ink/40"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isLoading,
  empty = "Nimic de afișat.",
  page,
  hasNext,
  hasPrevious,
  onPageChange,
  totalCount,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  empty?: string;
  page?: number;
  hasNext?: boolean;
  hasPrevious?: boolean;
  onPageChange?: (page: number) => void;
  totalCount?: number;
}) {
  const pagination =
    page !== undefined && onPageChange && (hasPrevious || hasNext) ? (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-ink/10 text-[12px] text-muted">
        <span>{totalCount !== undefined ? `${totalCount} rezultate` : ""}</span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            disabled={!hasPrevious}
            onClick={() => onPageChange(page - 1)}
            className="disabled:opacity-30 hover:text-ink cursor-pointer py-1"
          >
            ← Înapoi
          </button>
          <span>Pagina {page}</span>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => onPageChange(page + 1)}
            className="disabled:opacity-30 hover:text-ink cursor-pointer py-1"
          >
            Înainte →
          </button>
        </span>
      </div>
    ) : null;

  return (
    <div className="bg-white/70 border border-ink/10 rounded-sm overflow-hidden">
      {/* Mobile: card list */}
      <div className="lg:hidden divide-y divide-ink/5">
        {isLoading && rows.length === 0 && (
          <p className="px-4 py-10 text-center text-muted text-[13px]">Se încarcă…</p>
        )}
        {!isLoading && rows.length === 0 && (
          <p className="px-4 py-10 text-center text-muted text-[13px]">{empty}</p>
        )}
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`px-4 py-3.5 space-y-1.5 ${
              onRowClick ? "cursor-pointer active:bg-gold/5" : ""
            }`}
          >
            {columns.map((col, i) => (
              <div
                key={col.key}
                className={`flex items-start justify-between gap-3 text-sm ${
                  i === 0 ? "font-medium" : ""
                } ${col.className?.includes("text-right") ? "flex-row-reverse text-right" : ""}`}
              >
                <span className="text-[11px] tracking-[0.12em] uppercase text-muted shrink-0 pt-0.5">
                  {col.header}
                </span>
                <span className="min-w-0 text-right">{col.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
        {pagination}
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-paper/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left px-4 py-3 text-[11px] tracking-[0.14em] uppercase text-muted font-medium whitespace-nowrap ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted text-[13px]">
                  Se încarcă…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted text-[13px]">
                  {empty}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-ink/5 last:border-0 ${
                  onRowClick ? "cursor-pointer hover:bg-gold/5" : ""
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 align-middle ${col.className ?? ""}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {pagination}
      </div>
    </div>
  );
}
