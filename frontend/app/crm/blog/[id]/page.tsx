"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  CrmBlogCategory,
  CrmPostDetail,
  CrmTag,
  TiptapDoc,
} from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmDelete,
  useCrmDetail,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDeleteButton,
  Field,
  PageHeader,
  Select,
  TextArea,
  TextInput,
  useToast,
} from "@/components/crm/ui";
import RichTextEditor from "@/components/crm/RichTextEditor";
import PublishControls from "@/components/crm/PublishControls";
import MediaPicker, { MediaThumb } from "@/components/crm/MediaPicker";

type Draft = Partial<CrmPostDetail>;

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

export default function CrmPostEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const isNew = id === "new";
  const router = useRouter();
  const toast = useToast();

  const { data: post, isLoading } = useCrmDetail<CrmPostDetail>("posts", id);
  const { data: categories } = useCrmList<CrmBlogCategory[]>("blog-categories");
  const { data: tags } = useCrmList<CrmTag[]>("tags");

  const create = useCrmCreate<CrmPostDetail>("posts");
  const update = useCrmUpdate<CrmPostDetail>("posts");
  const remove = useCrmDelete("posts");

  const [draft, setDraft] = useState<Draft>({});
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (post) setDraft(post);
  }, [post]);

  if (!isNew && (isLoading || !post)) {
    return <p className="text-muted text-sm">Se încarcă…</p>;
  }

  const patch = (fields: Draft) => setDraft((d) => ({ ...d, ...fields }));
  const busy = create.isPending || update.isPending;

  function save() {
    const body: Draft = {
      title: draft.title,
      slug: draft.slug,
      status: draft.status ?? "draft",
      published_at: draft.published_at ?? null,
      body: (draft.body as TiptapDoc) ?? {},
      excerpt: draft.excerpt ?? "",
      category: draft.category ?? null,
      tag_ids: draft.tag_ids ?? [],
      featured_image: draft.featured_image ?? null,
      seo_title: draft.seo_title ?? "",
      seo_description: draft.seo_description ?? "",
      canonical_url: draft.canonical_url ?? "",
      noindex: draft.noindex ?? false,
    };
    if (!body.title || !body.slug) {
      toast("Titlul și slug-ul sunt obligatorii.", "error");
      return;
    }
    if (isNew) {
      create.mutate(body as CrmPostDetail, {
        onSuccess: (created) => {
          toast("Articolul a fost creat.");
          router.replace(`/crm/blog/${created.id}`);
        },
        onError: (err) => toast(err.message, "error"),
      });
    } else {
      update.mutate(
        { id, body },
        {
          onSuccess: () => toast("Articolul a fost salvat."),
          onError: (err) => toast(err.message, "error"),
        },
      );
    }
  }

  return (
    <div>
      <PageHeader
        title={isNew ? "Articol nou" : (post?.title ?? "")}
        subtitle={isNew ? undefined : `/blog/${post?.slug}`}
        actions={
          <>
            {!isNew && post && (
              <Link
                href={`/blog/${post.slug}`}
                target="_blank"
                className="avelink text-[13px] text-olive self-center mr-2"
              >
                Vezi pe site →
              </Link>
            )}
            <Link href="/crm/blog" className="avelink text-[13px] text-muted self-center mr-2">
              ← Blog
            </Link>
            <Button onClick={save} disabled={busy}>
              {busy ? "Se salvează…" : "Salvează"}
            </Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="space-y-4">
              <Field label="Titlu">
                <TextInput
                  value={draft.title ?? ""}
                  onChange={(e) => {
                    const title = e.target.value;
                    patch(slugTouched ? { title } : { title, slug: slugify(title) });
                  }}
                />
              </Field>
              <Field label="Slug">
                <TextInput
                  value={draft.slug ?? ""}
                  onChange={(e) => {
                    setSlugTouched(true);
                    patch({ slug: e.target.value });
                  }}
                />
              </Field>
              <Field label="Rezumat" hint="Afișat în lista de articole.">
                <TextArea
                  rows={2}
                  value={draft.excerpt ?? ""}
                  onChange={(e) => patch({ excerpt: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          <Card title="Conținut">
            <RichTextEditor
              value={(draft.body as TiptapDoc) ?? null}
              onChange={(doc) => patch({ body: doc })}
              placeholder="Scrie articolul… Folosește titluri, citate și imagini din bara de sus."
            />
          </Card>

          <Card title="SEO">
            <div className="space-y-4">
              <Field label="Titlu SEO" hint="Max. 70 caractere.">
                <TextInput
                  maxLength={70}
                  value={draft.seo_title ?? ""}
                  onChange={(e) => patch({ seo_title: e.target.value })}
                />
              </Field>
              <Field label="Descriere SEO" hint="Max. 160 caractere.">
                <TextArea
                  rows={2}
                  maxLength={160}
                  value={draft.seo_description ?? ""}
                  onChange={(e) => patch({ seo_description: e.target.value })}
                />
              </Field>
              <Field label="URL canonic" hint="Doar dacă articolul e republicat de altundeva.">
                <TextInput
                  value={draft.canonical_url ?? ""}
                  onChange={(e) => patch({ canonical_url: e.target.value })}
                />
              </Field>
              <Checkbox
                label="Noindex"
                hint="Cere motoarelor de căutare să nu indexeze articolul."
                checked={draft.noindex ?? false}
                onChange={(v) => patch({ noindex: v })}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Publicare">
            <PublishControls
              status={draft.status ?? "draft"}
              publishedAt={draft.published_at ?? null}
              onChange={(p) => patch(p as Draft)}
            />
            {!isNew && post && (
              <p className="text-[12px] text-muted mt-3">
                Timp de citire: ~{post.reading_time} min · {post.author_name}
              </p>
            )}
          </Card>

          <Card title="Imagine principală">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="block w-full cursor-pointer group"
            >
              <MediaThumb
                asset={draft.featured_image_data ?? null}
                className="w-full aspect-[4/3] rounded-sm border border-ink/10 group-hover:border-gold transition-colors"
              />
            </button>
            <div className="flex gap-2 mt-3">
              <Button variant="subtle" onClick={() => setPickerOpen(true)}>
                Alege
              </Button>
              {draft.featured_image && (
                <Button
                  variant="subtle"
                  onClick={() => patch({ featured_image: null, featured_image_data: null })}
                >
                  Elimină
                </Button>
              )}
            </div>
          </Card>

          <Card title="Categorie & etichete">
            <div className="space-y-4">
              <Field label="Categorie">
                <Select
                  value={draft.category ?? ""}
                  onChange={(e) =>
                    patch({ category: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">— Fără categorie —</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <p className="text-[12px] tracking-[0.12em] uppercase text-muted mb-2">
                  Etichete
                </p>
                {!tags?.length ? (
                  <p className="text-[13px] text-muted">
                    Nicio etichetă. Creează din „Categorii & etichete".
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {tags.map((tag) => {
                      const selected = draft.tag_ids?.includes(tag.id) ?? false;
                      return (
                        <Checkbox
                          key={tag.id}
                          label={tag.name}
                          checked={selected}
                          onChange={(v) =>
                            patch({
                              tag_ids: v
                                ? [...(draft.tag_ids ?? []), tag.id]
                                : (draft.tag_ids ?? []).filter((t) => t !== tag.id),
                            })
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {!isNew && (
            <Card title="Zonă periculoasă">
              <ConfirmDeleteButton
                label="Șterge articolul"
                onConfirm={() =>
                  remove.mutate(id, {
                    onSuccess: () => {
                      toast("Articolul a fost șters.");
                      router.push("/crm/blog");
                    },
                    onError: (err) => toast(err.message, "error"),
                  })
                }
              />
            </Card>
          )}
        </div>
      </div>

      {pickerOpen && (
        <MediaPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(asset) => {
            setPickerOpen(false);
            patch({
              featured_image: asset.id,
              featured_image_data: asset.url
                ? { id: asset.id, url: asset.url, alt_text: asset.alt_text, title: asset.title }
                : null,
            });
          }}
        />
      )}
    </div>
  );
}
