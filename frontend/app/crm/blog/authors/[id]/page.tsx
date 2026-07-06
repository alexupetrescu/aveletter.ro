"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

import { CrmAuthorProfile } from "@/lib/crm-api";
import { useCrmDetail, useCrmUpdate } from "@/lib/crm-hooks";
import {
  Button,
  Card,
  Field,
  PageHeader,
  TextArea,
  TextInput,
  useToast,
} from "@/components/crm/ui";
import MediaPicker, { MediaThumb } from "@/components/crm/MediaPicker";

type Draft = Partial<CrmAuthorProfile>;

export default function CrmAuthorEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const toast = useToast();
  const { data: profile, isLoading } = useCrmDetail<CrmAuthorProfile>(
    "author-profiles",
    id,
  );
  const update = useCrmUpdate<CrmAuthorProfile>("author-profiles");

  const [draft, setDraft] = useState<Draft>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (profile) setDraft(profile);
  }, [profile]);

  if (isLoading || !profile) {
    return <p className="text-muted text-sm">Se încarcă…</p>;
  }

  const patch = (fields: Draft) => setDraft((d) => ({ ...d, ...fields }));

  function save() {
    update.mutate(
      {
        id,
        body: {
          photo: draft.photo ?? null,
          bio: draft.bio ?? "",
          instagram_url: draft.instagram_url ?? "",
          facebook_url: draft.facebook_url ?? "",
        },
      },
      {
        onSuccess: () => toast("Profilul autorului a fost salvat."),
        onError: (err) => toast(err.message, "error"),
      },
    );
  }

  return (
    <div>
      <PageHeader
        title={profile.user_name}
        subtitle="Profil autor pentru articolele din jurnal"
        actions={
          <>
            <Link
              href="/crm/blog/authors"
              className="avelink text-[13px] text-olive self-center mr-3"
            >
              ← Autori
            </Link>
            <Button onClick={save} disabled={update.isPending}>
              Salvează
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card title="Fotografie">
          <div className="space-y-3">
            <MediaThumb
              asset={draft.photo_data ?? null}
              className="aspect-square w-full max-w-[200px] rounded-full"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="subtle" onClick={() => setPickerOpen(true)}>
                Alege din media
              </Button>
              {draft.photo && (
                <Button
                  variant="subtle"
                  onClick={() => patch({ photo: null, photo_data: null })}
                >
                  Elimină
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card title="Detalii">
          <div className="space-y-4">
            <Field label="Descriere">
              <TextArea
                rows={4}
                value={draft.bio ?? ""}
                onChange={(e) => patch({ bio: e.target.value })}
                placeholder="Scurtă prezentare afișată sub articolele autorului"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Instagram">
                <TextInput
                  value={draft.instagram_url ?? ""}
                  onChange={(e) => patch({ instagram_url: e.target.value })}
                  placeholder="https://instagram.com/…"
                />
              </Field>
              <Field label="Facebook">
                <TextInput
                  value={draft.facebook_url ?? ""}
                  onChange={(e) => patch({ facebook_url: e.target.value })}
                  placeholder="https://facebook.com/…"
                />
              </Field>
            </div>
            <p className="text-[12px] text-muted">
              Linkurile goale nu sunt afișate pe site.
            </p>
          </div>
        </Card>
      </div>

      {pickerOpen && (
        <MediaPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(asset) => {
            patch({
              photo: asset.id,
              photo_data: {
                id: asset.id,
                url: asset.url,
                alt_text: asset.alt_text,
                title: asset.title,
              },
            });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
