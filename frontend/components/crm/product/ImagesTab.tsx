"use client";

import { useState } from "react";

import { CrmProductImage } from "@/lib/crm-api";
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
  TextInput,
  useToast,
} from "@/components/crm/ui";
import MediaPicker, { MediaThumb } from "@/components/crm/MediaPicker";

export default function ImagesTab({ productId }: { productId: number }) {
  const toast = useToast();
  const { data: images, isLoading } = useCrmList<CrmProductImage[]>(
    "product-images",
    { product: productId },
  );
  const create = useCrmCreate<CrmProductImage>("product-images");
  const update = useCrmUpdate<CrmProductImage>("product-images");
  const remove = useCrmDelete("product-images");

  const [pickerOpen, setPickerOpen] = useState(false);

  const sorted = [...(images ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Card title="Galeria produsului">
      {isLoading ? (
        <p className="text-muted text-sm">Se încarcă…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sorted.map((img) => (
              <div key={img.id} className="border border-ink/10 rounded-sm p-2 space-y-2">
                <MediaThumb
                  asset={img.asset_data}
                  className="w-full aspect-square rounded-sm"
                />
                <TextInput
                  placeholder="Alt text (opțional)"
                  defaultValue={img.alt_text_override}
                  onBlur={(e) => {
                    if (e.target.value !== img.alt_text_override) {
                      update.mutate(
                        { id: img.id, body: { alt_text_override: e.target.value } },
                        { onError: (err) => toast(err.message, "error") },
                      );
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <TextInput
                    type="number"
                    className="!w-20"
                    defaultValue={img.sort_order}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== img.sort_order) {
                        update.mutate(
                          { id: img.id, body: { sort_order: v } },
                          { onError: (err) => toast(err.message, "error") },
                        );
                      }
                    }}
                  />
                  <ConfirmDeleteButton
                    message="Scoți imaginea din galerie?"
                    onConfirm={() =>
                      remove.mutate(img.id, {
                        onSuccess: () => toast("Imaginea a fost scoasă."),
                        onError: (err) => toast(err.message, "error"),
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <Button variant="subtle" className="mt-4" onClick={() => setPickerOpen(true)}>
            + Adaugă imagine
          </Button>
        </>
      )}
      {pickerOpen && (
        <MediaPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(asset) => {
            setPickerOpen(false);
            create.mutate(
              {
                product: productId,
                asset: asset.id,
                sort_order: images?.length ?? 0,
              },
              {
                onSuccess: () => toast("Imaginea a fost adăugată."),
                onError: (err) => toast(err.message, "error"),
              },
            );
          }}
        />
      )}
    </Card>
  );
}
