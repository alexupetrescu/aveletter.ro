"use client";

import { useState } from "react";
import Link from "next/link";

import { CrmBlogCategory, CrmTag } from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmDelete,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import {
  Button,
  Card,
  ConfirmDeleteButton,
  PageHeader,
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

function TaxonomyList<T extends { id: number; name: string; slug: string }>({
  title,
  resource,
  hint,
}: {
  title: string;
  resource: string;
  hint: string;
}) {
  const toast = useToast();
  const { data: items, isLoading } = useCrmList<T[]>(resource);
  const create = useCrmCreate<T>(resource);
  const update = useCrmUpdate<T>(resource);
  const remove = useCrmDelete(resource);

  const [name, setName] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  return (
    <Card title={title}>
      <p className="text-[12px] text-muted mb-4">{hint}</p>
      {isLoading ? (
        <p className="text-muted text-sm">Se încarcă…</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {items?.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 border border-ink/10 rounded-sm px-3 py-2"
            >
              {editing === item.id ? (
                <span className="flex items-center gap-2 flex-1">
                  <TextInput
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Button
                    disabled={!editName}
                    onClick={() =>
                      update.mutate(
                        {
                          id: item.id,
                          body: { name: editName, slug: slugify(editName) } as Partial<T>,
                        },
                        {
                          onSuccess: () => {
                            toast("Salvat.");
                            setEditing(null);
                          },
                          onError: (err) => toast(err.message, "error"),
                        },
                      )
                    }
                  >
                    Salvează
                  </Button>
                  <Button variant="subtle" onClick={() => setEditing(null)}>
                    Anulează
                  </Button>
                </span>
              ) : (
                <>
                  <span className="text-sm">
                    {item.name} <span className="text-muted text-[12px]">/{item.slug}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="subtle"
                      onClick={() => {
                        setEditing(item.id);
                        setEditName(item.name);
                      }}
                    >
                      Editează
                    </Button>
                    <ConfirmDeleteButton
                      onConfirm={() =>
                        remove.mutate(item.id, {
                          onSuccess: () => toast("Șters."),
                          onError: (err) => toast(err.message, "error"),
                        })
                      }
                    />
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <TextInput
          placeholder="Nume nou…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={!name || create.isPending}
          onClick={() =>
            create.mutate({ name, slug: slugify(name) } as Partial<T>, {
              onSuccess: () => {
                toast("Adăugat.");
                setName("");
              },
              onError: (err) => toast(err.message, "error"),
            })
          }
        >
          Adaugă
        </Button>
      </div>
    </Card>
  );
}

export default function CrmTaxonomiesPage() {
  return (
    <div>
      <PageHeader
        title="Categorii & etichete"
        subtitle="Taxonomiile blogului"
        actions={
          <Link href="/crm/blog" className="avelink text-[13px] text-muted self-center">
            ← Blog
          </Link>
        }
      />
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <TaxonomyList<CrmBlogCategory>
          title="Categorii"
          resource="blog-categories"
          hint="Un articol aparține unei singure categorii."
        />
        <TaxonomyList<CrmTag>
          title="Etichete"
          resource="tags"
          hint="Un articol poate avea oricâte etichete."
        />
      </div>
    </div>
  );
}
