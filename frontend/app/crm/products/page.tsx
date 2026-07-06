"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CrmProductList, Paginated } from "@/lib/crm-api";
import { useCrmList } from "@/lib/crm-hooks";
import { formatBani } from "@/lib/money";
import { Button, PageHeader, StatusBadge } from "@/components/crm/ui";
import { DataTable, FilterChips, SearchInput } from "@/components/crm/DataTable";
import { MediaThumb } from "@/components/crm/MediaPicker";

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  text_by_page: "Text pe pagină",
  ornament: "Ornament",
  custom_quote: "Ofertă personalizată",
  premade: "Pregătit (cu stoc)",
};

export default function CrmProductsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useCrmList<Paginated<CrmProductList>>("products", {
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
            key: "state",
            header: "Stare",
            render: (p) => <StatusBadge value={p.status === "published" ? p.publish_state : p.status} label={p.publish_state} />,
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
