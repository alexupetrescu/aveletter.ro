"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { crm, CrmMediaAsset, Paginated } from "@/lib/crm-api";
import { useCrmList } from "@/lib/crm-hooks";
import { Button } from "./ui";
import { SearchInput } from "./DataTable";

export function MediaThumb({
  asset,
  className = "",
}: {
  asset: { url: string | null; alt_text?: string } | null;
  className?: string;
}) {
  if (!asset?.url) {
    return <div className={`photo-placeholder ${className}`} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={asset.url}
      alt={asset.alt_text ?? ""}
      className={`object-cover ${className}`}
    />
  );
}

export default function MediaPicker({
  onSelect,
  onClose,
  kind = "image",
}: {
  onSelect: (asset: CrmMediaAsset) => void;
  onClose: () => void;
  kind?: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useCrmList<Paginated<CrmMediaAsset>>("media", {
    kind,
    search: search || undefined,
    page,
  });

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", files[0]);
      const asset = await crm.upload<CrmMediaAsset>("/media/", form);
      qc.invalidateQueries({ queryKey: ["crm", "media"] });
      onSelect(asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Încărcarea a eșuat.");
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-ink/40 grid place-items-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-paper border border-ink/10 rounded-sm w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink/10">
          <h2 className="font-serif text-xl">Bibliotecă media</h2>
          <div className="flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            <Button
              variant="subtle"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Se încarcă…" : "Încarcă"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={kind === "image" ? "image/*" : undefined}
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button variant="subtle" onClick={onClose}>
              Închide
            </Button>
          </div>
        </div>
        {error && (
          <p className="text-[13px] text-red-700 px-5 py-2 border-b border-red-200 bg-red-50">
            {error}
          </p>
        )}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <p className="text-muted text-sm py-8 text-center">Se încarcă…</p>
          ) : !data?.results.length ? (
            <p className="text-muted text-sm py-8 text-center">
              Nicio imagine. Folosește „Încarcă" pentru a adăuga.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {data.results.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelect(asset)}
                  className="group text-left cursor-pointer"
                >
                  <MediaThumb
                    asset={asset}
                    className="w-full aspect-square rounded-sm border border-ink/10 group-hover:border-gold transition-colors"
                  />
                  <p className="text-[11px] text-muted mt-1 truncate">
                    {asset.title || asset.original_filename}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        {data && (data.next || data.previous) && (
          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-ink/10 text-[12px] text-muted">
            <button
              type="button"
              disabled={!data.previous}
              onClick={() => setPage((p) => p - 1)}
              className="disabled:opacity-30 hover:text-ink cursor-pointer"
            >
              ← Înapoi
            </button>
            <span>Pagina {page}</span>
            <button
              type="button"
              disabled={!data.next}
              onClick={() => setPage((p) => p + 1)}
              className="disabled:opacity-30 hover:text-ink cursor-pointer"
            >
              Înainte →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
