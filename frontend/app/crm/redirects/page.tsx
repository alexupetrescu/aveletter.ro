"use client";

import { useState } from "react";

import { CrmRedirect, Paginated } from "@/lib/crm-api";
import { useCrmCreate, useCrmDelete, useCrmList } from "@/lib/crm-hooks";
import {
  Button,
  Card,
  ConfirmDeleteButton,
  Field,
  PageHeader,
  TextInput,
  useToast,
} from "@/components/crm/ui";

export default function CrmRedirectsPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useCrmList<Paginated<CrmRedirect>>("redirects", { page });
  const create = useCrmCreate<CrmRedirect>("redirects");
  const remove = useCrmDelete("redirects");

  const [oldPath, setOldPath] = useState("");
  const [newPath, setNewPath] = useState("");

  return (
    <div>
      <PageHeader
        title="Redirecturi"
        subtitle="Căi vechi redirecționate spre căi noi (ex. după schimbarea unui slug)"
      />
      <Card title="Adaugă redirect" className="mb-6">
        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          <Field label="Cale veche" hint="ex: /blog/articol-vechi">
            <TextInput value={oldPath} onChange={(e) => setOldPath(e.target.value)} />
          </Field>
          <Field label="Cale nouă" hint="ex: /blog/articol-nou">
            <TextInput value={newPath} onChange={(e) => setNewPath(e.target.value)} />
          </Field>
        </div>
        <Button
          className="mt-4"
          disabled={!oldPath || !newPath || create.isPending}
          onClick={() =>
            create.mutate(
              { old_path: oldPath, new_path: newPath },
              {
                onSuccess: () => {
                  toast("Redirectul a fost creat.");
                  setOldPath("");
                  setNewPath("");
                },
                onError: (err) => toast(err.message, "error"),
              },
            )
          }
        >
          Adaugă
        </Button>
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-muted text-sm">Se încarcă…</p>
        ) : !data?.results.length ? (
          <p className="text-muted text-sm">Niciun redirect.</p>
        ) : (
          <ul className="space-y-2">
            {data.results.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border border-ink/10 rounded-sm px-3 py-2"
              >
                <span className="text-sm font-mono">
                  {r.old_path} <span className="text-gold">→</span> {r.new_path}
                </span>
                <ConfirmDeleteButton
                  onConfirm={() =>
                    remove.mutate(r.id, {
                      onSuccess: () => toast("Redirectul a fost șters."),
                      onError: (err) => toast(err.message, "error"),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {data && (data.next || data.previous) && (
          <div className="flex items-center gap-3 mt-4 text-[12px] text-muted">
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
      </Card>
    </div>
  );
}
