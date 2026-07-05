"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CrmOrderList, Paginated } from "@/lib/crm-api";
import { useCrmList } from "@/lib/crm-hooks";
import { formatBani } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/crm/ui";
import { DataTable, FilterChips, SearchInput } from "@/components/crm/DataTable";
import { ORDER_STATUS_LABELS } from "@/components/crm/orderStatus";

export default function CrmOrdersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useCrmList<Paginated<CrmOrderList>>("orders", {
    search: search || undefined,
    status: status || undefined,
    page,
  });

  return (
    <div>
      <PageHeader title="Comenzi" subtitle="Toate comenzile magazinului" />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Număr, email sau telefon…"
        />
        <FilterChips
          options={Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
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
            key: "number",
            header: "Comandă",
            render: (o) => <span className="font-medium">{o.order_number}</span>,
          },
          {
            key: "client",
            header: "Client",
            render: (o) => (
              <span>
                {o.email}
                {o.phone && <span className="text-muted"> · {o.phone}</span>}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (o) => (
              <StatusBadge value={o.status} label={ORDER_STATUS_LABELS[o.status]} />
            ),
          },
          {
            key: "placed",
            header: "Plasată",
            render: (o) =>
              o.placed_at
                ? new Date(o.placed_at).toLocaleDateString("ro-RO")
                : "—",
          },
          {
            key: "total",
            header: "Total",
            className: "text-right",
            render: (o) => formatBani(o.total_amount),
          },
        ]}
        rows={data?.results ?? []}
        rowKey={(o) => o.id}
        onRowClick={(o) => router.push(`/crm/orders/${o.order_number}`)}
        isLoading={isLoading}
        empty="Nicio comandă găsită."
        page={page}
        hasNext={Boolean(data?.next)}
        hasPrevious={Boolean(data?.previous)}
        onPageChange={setPage}
        totalCount={data?.count}
      />
    </div>
  );
}
