"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { crm, CrmMediaAsset, Paginated } from "@/lib/crm-api";
import { useCrmDelete, useCrmList, useCrmUpdate } from "@/lib/crm-hooks";
import {
  Button,
  Card,
  ConfirmDeleteButton,
  Field,
  PageHeader,
  Select,
  TextArea,
  TextInput,
  useToast,
} from "@/components/crm/ui";
import { FilterChips, SearchInput } from "@/components/crm/DataTable";
import { MediaThumb } from "@/components/crm/MediaPicker";

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AssetDetail({
  asset,
  onClose,
}: {
  asset: CrmMediaAsset;
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useCrmUpdate<CrmMediaAsset>("media");
  const remove = useCrmDelete("media");
  const [title, setTitle] = useState(asset.title);
  const [alt, setAlt] = useState(asset.alt_text);
  const [caption, setCaption] = useState(asset.caption);
  const [visibility, setVisibility] = useState(asset.visibility);

  return (
    <div className="fixed inset-0 z-40 bg-ink/40 grid place-items-center p-6" onClick={onClose}>
      <div
        className="bg-paper border border-ink/10 rounded-sm w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink/10">
          <h2 className="font-serif text-xl truncate">
            {asset.title || asset.original_filename}
          </h2>
          <Button variant="subtle" onClick={onClose}>
            Închide
          </Button>
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-5">
          <div>
            <MediaThumb asset={asset} className="w-full rounded-sm border border-ink/10" />
            <p className="text-[12px] text-muted mt-2">
              {asset.mime_type || asset.kind} · {formatSize(asset.size_bytes)}
              {asset.width && asset.height && ` · ${asset.width}×${asset.height}px`}
              <br />
              Încărcat {new Date(asset.created_at).toLocaleDateString("ro-RO")}
            </p>
          </div>
          <div className="space-y-4">
            <Field label="Titlu">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Text alternativ" hint="Descriere pentru accesibilitate și SEO.">
              <TextInput value={alt} onChange={(e) => setAlt(e.target.value)} />
            </Field>
            <Field label="Legendă">
              <TextArea rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </Field>
            <Field label="Vizibilitate">
              <Select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as CrmMediaAsset["visibility"])}
              >
                <option value="public">Publică</option>
                <option value="private">Privată</option>
              </Select>
            </Field>
            <div className="flex items-center gap-2 pt-2">
              <Button
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    {
                      id: asset.id,
                      body: { title, alt_text: alt, caption, visibility },
                    },
                    {
                      onSuccess: () => toast("Detaliile au fost salvate."),
                      onError: (err) => toast(err.message, "error"),
                    },
                  )
                }
              >
                Salvează
              </Button>
              <ConfirmDeleteButton
                message="Ștergi definitiv fișierul?"
                onConfirm={() =>
                  remove.mutate(asset.id, {
                    onSuccess: () => {
                      toast("Fișierul a fost șters.");
                      onClose();
                    },
                    onError: (err) => toast(err.message, "error"),
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CrmMediaPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<CrmMediaAsset | null>(null);

  const { data, isLoading } = useCrmList<Paginated<CrmMediaAsset>>("media", {
    search: search || undefined,
    kind: kind || undefined,
    page,
  });

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        await crm.upload<CrmMediaAsset>("/media/", form);
      }
      qc.invalidateQueries({ queryKey: ["crm", "media"] });
      toast(`${files.length} fișier(e) încărcat(e).`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Încărcarea a eșuat.", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title="Media"
        subtitle="Imaginile și fișierele site-ului"
        actions={
          <>
            <Button disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "Se încarcă…" : "+ Încarcă fișiere"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Titlu, alt text sau nume fișier…"
        />
        <FilterChips
          options={[
            { value: "image", label: "Imagini" },
            { value: "video", label: "Video" },
            { value: "file", label: "Fișiere" },
          ]}
          value={kind}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
        />
      </div>

      <Card>
        {isLoading ? (
          <p className="text-muted text-sm">Se încarcă…</p>
        ) : !data?.results.length ? (
          <p className="text-muted text-sm">Niciun fișier. Încarcă primul!</p>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {data.results.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setSelected(asset)}
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
        {data && (data.next || data.previous) && (
          <div className="flex items-center justify-end gap-3 mt-4 text-[12px] text-muted">
            <button
              type="button"
              disabled={!data.previous}
              onClick={() => setPage((p) => p - 1)}
              className="disabled:opacity-30 hover:text-ink cursor-pointer"
            >
              ← Înapoi
            </button>
            <span>
              Pagina {page} · {data.count} fișiere
            </span>
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
      </Card>

      {selected && <AssetDetail asset={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
