"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CrmProductList,
  CrmProductRecommendation,
  CrmRecommendationSuggestions,
  Paginated,
  crm,
} from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmDelete,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import { formatBani } from "@/lib/money";
import { SearchInput } from "@/components/crm/DataTable";
import { MediaThumb } from "@/components/crm/MediaPicker";
import {
  Button,
  Card,
  ConfirmDeleteButton,
  TextInput,
  useToast,
} from "@/components/crm/ui";

type RecKind = "upsell" | "cross_sell";

const KIND_LABELS: Record<RecKind, { title: string; hint: string }> = {
  upsell: {
    title: "Vânzare superioară",
    hint: "Produse premium sau variante mai scumpe — alternative superioare.",
  },
  cross_sell: {
    title: "Vânzare încrucișată",
    hint: "Produse complementare, adesea cumpărate împreună.",
  },
};

function RecommendationSection({
  productId,
  kind,
  existingIds,
}: {
  productId: number;
  kind: RecKind;
  existingIds: Set<number>;
}) {
  const toast = useToast();
  const labels = KIND_LABELS[kind];

  const { data: recommendations, isLoading } = useCrmList<CrmProductRecommendation[]>(
    "product-recommendations",
    { product: productId, kind },
  );
  const create = useCrmCreate<CrmProductRecommendation>("product-recommendations");
  const update = useCrmUpdate<CrmProductRecommendation>("product-recommendations");
  const remove = useCrmDelete("product-recommendations");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [suggestions, setSuggestions] = useState<CrmProductList[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: searchResults } = useCrmList<Paginated<CrmProductList>>(
    "products",
    debouncedSearch.length >= 2
      ? { search: debouncedSearch, page: 1 }
      : undefined,
  );

  const sorted = useMemo(
    () => [...(recommendations ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [recommendations],
  );

  const searchHits = (searchResults?.results ?? []).filter(
    (p) => p.id !== productId && !existingIds.has(p.id),
  );

  function addTarget(targetId: number) {
    if (existingIds.has(targetId)) {
      toast("Produsul este deja adăugat.", "error");
      return;
    }
    create.mutate(
      {
        source: productId,
        target: targetId,
        kind,
        sort_order: sorted.length,
      },
      {
        onSuccess: () => {
          toast("Recomandare adăugată.");
          setSearch("");
        },
        onError: (err) => toast(err.message, "error"),
      },
    );
  }

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    try {
      const data = await crm.get<CrmRecommendationSuggestions>(
        `/products/${productId}/recommendation-suggestions/`,
      );
      const items = kind === "upsell" ? data.upsells : data.cross_sells;
      setSuggestions(items.filter((p) => !existingIds.has(p.id)));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Eroare la sugestii.", "error");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  return (
    <Card title={labels.title}>
      <p className="text-muted text-sm mb-4 -mt-1">{labels.hint}</p>
      <div className="space-y-4">
        <div className="relative">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Caută produse existente…"
          />
          {debouncedSearch.length >= 2 && searchHits.length > 0 && (
            <div className="absolute z-10 mt-1 w-full sm:w-96 max-w-full border border-ink/10 rounded-sm bg-white shadow-md max-h-60 overflow-y-auto">
              {searchHits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addTarget(p.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gold/5 cursor-pointer border-b border-ink/5 last:border-0"
                >
                  <MediaThumb
                    asset={p.featured_image_data}
                    className="w-10 h-10 rounded-sm border border-ink/10 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm truncate">{p.title}</p>
                    <p className="text-xs text-muted">
                      {formatBani(p.base_price_amount)} · {p.status}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="subtle"
            onClick={loadSuggestions}
            disabled={loadingSuggestions}
          >
            {loadingSuggestions ? "Se calculează…" : "Sugestii automate"}
          </Button>
          {suggestions.length > 0 && (
            <Button
              variant="subtle"
              onClick={() => {
                for (const p of suggestions) addTarget(p.id);
                setSuggestions([]);
              }}
            >
              Adaugă toate sugestiile ({suggestions.length})
            </Button>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addTarget(p.id)}
                className="flex items-center gap-2 border border-gold/30 rounded-sm px-2 py-1.5 text-xs hover:bg-gold/5 cursor-pointer"
              >
                <MediaThumb
                  asset={p.featured_image_data}
                  className="w-8 h-8 rounded-sm"
                />
                <span>{p.title}</span>
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <p className="text-muted text-sm">Se încarcă…</p>
        ) : sorted.length === 0 ? (
          <p className="text-muted text-sm">
            Niciun produs adăugat manual. Pe site, recomandările se completează
            automat dacă lista e goală.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center gap-3 border border-ink/10 rounded-sm p-3"
              >
                <MediaThumb
                  asset={rec.target_data.featured_image_data}
                  className="w-12 h-12 rounded-sm border border-ink/10 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{rec.target_data.title}</p>
                  <p className="text-xs text-muted">
                    {formatBani(rec.target_data.base_price_amount)} ·{" "}
                    {rec.target_data.status}
                  </p>
                </div>
                <TextInput
                  type="number"
                  className="!w-16"
                  defaultValue={rec.sort_order}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== rec.sort_order) {
                      update.mutate(
                        { id: rec.id, body: { sort_order: v } },
                        { onError: (err) => toast(err.message, "error") },
                      );
                    }
                  }}
                />
                <ConfirmDeleteButton
                  message="Elimini această recomandare?"
                  onConfirm={() =>
                    remove.mutate(rec.id, {
                      onSuccess: () => toast("Recomandarea a fost eliminată."),
                      onError: (err) => toast(err.message, "error"),
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function RecommendationsTab({ productId }: { productId: number }) {
  const { data: allRecs } = useCrmList<CrmProductRecommendation[]>(
    "product-recommendations",
    { product: productId },
  );

  const existingIds = useMemo(
    () => new Set((allRecs ?? []).map((r) => r.target)),
    [allRecs],
  );

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <RecommendationSection
        productId={productId}
        kind="upsell"
        existingIds={existingIds}
      />
      <RecommendationSection
        productId={productId}
        kind="cross_sell"
        existingIds={existingIds}
      />
    </div>
  );
}
