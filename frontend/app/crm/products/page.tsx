"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { checkProductSku, CrmProductList, Paginated } from "@/lib/crm-api";
import { useCrmList, useCrmUpdate } from "@/lib/crm-hooks";
import { formatBani } from "@/lib/money";
import { Button, PageHeader, Select, useToast } from "@/components/crm/ui";
import { DataTable, FilterChips, SearchInput } from "@/components/crm/DataTable";
import { MediaThumb } from "@/components/crm/MediaPicker";
import PublishStatusSelect from "@/components/crm/PublishStatusSelect";
import { SaveStatusIndicator } from "@/components/crm/SaveStatusIndicator";
import {
  STOCK_STATUS_OPTIONS,
  StockStatus,
} from "@/components/crm/stockStatus";

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  text_by_page: "Text pe pagină",
  ornament: "Ornament",
  custom_quote: "Ofertă personalizată",
  premade: "Pregătit (cu stoc)",
};

function PublishStatusCell({
  product,
  onUpdated,
}: {
  product: CrmProductList;
  onUpdated: () => void;
}) {
  const update = useCrmUpdate<CrmProductList>("products");
  const toast = useToast();
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <PublishStatusSelect
        compact
        status={product.status}
        publishedAt={product.published_at}
        disabled={update.isPending}
        onChange={(next) => {
          const body: Partial<CrmProductList> = { status: next };
          if (next === "published") {
            body.published_at = null;
          }

          update.mutate(
            { id: product.id, body },
            {
              onSuccess: () => {
                setSaved(true);
                onUpdated();
              },
              onError: (err) => toast(err.message, "error"),
            },
          );
        }}
      />
      <SaveStatusIndicator pending={update.isPending} saved={saved && !update.isPending} />
    </div>
  );
}

type SkuAvailability = "idle" | "checking" | "available" | "taken";

function SkuInput({
  product,
  onUpdated,
}: {
  product: CrmProductList;
  onUpdated: () => void;
}) {
  const update = useCrmUpdate<CrmProductList>("products");
  const toast = useToast();
  const [value, setValue] = useState(product.sku ?? "");
  const [availability, setAvailability] = useState<SkuAvailability>("idle");

  useEffect(() => {
    setValue(product.sku ?? "");
    setAvailability("idle");
  }, [product.id, product.sku]);

  useEffect(() => {
    const trimmed = value.trim();
    const current = product.sku ?? "";

    if (trimmed === current) {
      setAvailability("idle");
      return;
    }
    if (!trimmed) {
      setAvailability("available");
      return;
    }

    setAvailability("checking");
    const timer = setTimeout(() => {
      checkProductSku(trimmed, product.id)
        .then((result) => {
          setAvailability(result.available ? "available" : "taken");
        })
        .catch(() => setAvailability("idle"));
    }, 300);

    return () => clearTimeout(timer);
  }, [value, product.id, product.sku]);

  async function commit() {
    const sku = value.trim() || null;
    const current = product.sku ?? null;
    if (sku === current || (sku === null && current === null)) return;

    if (sku && availability === "taken") {
      toast("SKU-ul este deja folosit.", "error");
      setValue(product.sku ?? "");
      setAvailability("idle");
      return;
    }

    if (availability === "checking") {
      try {
        const result = await checkProductSku(sku ?? "", product.id);
        if (sku && !result.available) {
          toast(result.conflict ?? "SKU-ul este deja folosit.", "error");
          setValue(product.sku ?? "");
          setAvailability("idle");
          return;
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : "Verificarea SKU a eșuat.", "error");
        return;
      }
    }

    update.mutate(
      { id: product.id, body: { sku } },
      {
        onSuccess: onUpdated,
        onError: (err) => {
          toast(err.message, "error");
          setValue(product.sku ?? "");
          setAvailability("idle");
        },
      },
    );
  }

  const showCheck = availability === "available" && value.trim() !== (product.sku ?? "");
  const showCross = availability === "taken";
  const borderClass =
    showCross
      ? "border-red-400 focus:border-red-500"
      : showCheck
        ? "border-olive/50 focus:border-olive"
        : "border-ink/15 focus:border-gold";

  return (
    <div
      className="flex items-center gap-1.5 min-w-[7rem]"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        value={value}
        disabled={update.isPending}
        placeholder="—"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setValue(product.sku ?? "");
            setAvailability("idle");
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={`w-full min-w-[5.5rem] border bg-paper px-2 py-1 text-[12px] font-mono rounded-sm outline-none disabled:opacity-60 ${borderClass}`}
      />
      <span className="w-4 shrink-0 text-center text-[13px]" aria-hidden>
        {availability === "checking" && (
          <span className="text-muted">…</span>
        )}
        {showCheck && <span className="text-olive">✓</span>}
        {showCross && <span className="text-red-600">✗</span>}
      </span>
    </div>
  );
}

function StockStatusSelect({
  product,
  onUpdated,
}: {
  product: CrmProductList;
  onUpdated: () => void;
}) {
  const update = useCrmUpdate<CrmProductList>("products");
  const toast = useToast();

  return (
    <Select
      value={product.stock_quantity === 0 ? "on_order" : product.stock_status}
      disabled={update.isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const stock_status = e.target.value as StockStatus;
        update.mutate(
          { id: product.id, body: { stock_status } },
          {
            onSuccess: onUpdated,
            onError: (err) => toast(err.message, "error"),
          },
        );
      }}
      className="text-[12px] py-1 min-w-[8.5rem]"
    >
      {STOCK_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  );
}

function StockQuantityInput({
  product,
  onUpdated,
}: {
  product: CrmProductList;
  onUpdated: () => void;
}) {
  const update = useCrmUpdate<CrmProductList>("products");
  const toast = useToast();
  const [value, setValue] = useState(String(product.stock_quantity));

  function commit() {
    const stock_quantity = Math.max(0, Number(value) || 0);
    if (stock_quantity === product.stock_quantity) return;
    update.mutate(
      { id: product.id, body: { stock_quantity } },
      {
        onSuccess: onUpdated,
        onError: (err) => toast(err.message, "error"),
      },
    );
  }

  return (
    <input
      type="number"
      min={0}
      value={value}
      disabled={update.isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-16 border border-ink/15 bg-paper px-2 py-1 text-[13px] text-right rounded-sm"
    />
  );
}

export default function CrmProductsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useCrmList<Paginated<CrmProductList>>("products", {
    search: search || undefined,
    status: status || undefined,
    page,
  });

  return (
    <div>
      <PageHeader
        title="Produse"
        subtitle="Catalogul magazinului"
        actions={
          <Button onClick={() => router.push("/crm/products/new")}>
            + Produs nou
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Titlu sau slug…"
        />
        <FilterChips
          options={[
            { value: "published", label: "Publicate" },
            { value: "draft", label: "Ciorne" },
            { value: "archived", label: "Arhivate" },
          ]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        columns={[
          {
            key: "image",
            header: "",
            className: "w-14",
            render: (p) => (
              <MediaThumb
                asset={p.featured_image_data}
                className="w-10 h-10 rounded-sm border border-ink/10"
              />
            ),
          },
          {
            key: "title",
            header: "Produs",
            render: (p) => (
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-[12px] text-muted">/{p.slug}</p>
              </div>
            ),
          },
          {
            key: "type",
            header: "Tip",
            render: (p) => (
              <span className="text-[13px]">{PRODUCT_TYPE_LABELS[p.product_type]}</span>
            ),
          },
          {
            key: "category",
            header: "Categorie",
            render: (p) => p.category_name ?? "—",
          },
          {
            key: "sku",
            header: "SKU",
            render: (p) => (
              <SkuInput
                key={`${p.id}-${p.sku ?? ""}`}
                product={p}
                onUpdated={() => refetch()}
              />
            ),
          },
          {
            key: "stock",
            header: "Stoc",
            className: "text-right",
            render: (p) =>
              p.product_type === "premade" ? (
                <StockQuantityInput
                  key={`${p.id}-${p.stock_quantity}`}
                  product={p}
                  onUpdated={() => refetch()}
                />
              ) : (
                "—"
              ),
          },
          {
            key: "stock_status",
            header: "Stare stoc",
            render: (p) =>
              p.product_type === "premade" ? (
                <StockStatusSelect product={p} onUpdated={() => refetch()} />
              ) : (
                "—"
              ),
          },
          {
            key: "state",
            header: "Stare",
            render: (p) => (
              <PublishStatusCell product={p} onUpdated={() => refetch()} />
            ),
          },
          {
            key: "price",
            header: "Preț bază",
            className: "text-right",
            render: (p) => formatBani(p.base_price_amount),
          },
        ]}
        rows={data?.results ?? []}
        rowKey={(p) => p.id}
        onRowClick={(p) => router.push(`/crm/products/${p.id}`)}
        isLoading={isLoading}
        empty="Niciun produs găsit."
        page={page}
        hasNext={Boolean(data?.next)}
        hasPrevious={Boolean(data?.previous)}
        onPageChange={setPage}
        totalCount={data?.count}
      />
    </div>
  );
}
