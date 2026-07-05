"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { CrmStats } from "@/lib/crm-api";
import { useCrmSingleton } from "@/lib/crm-hooks";
import { formatBani } from "@/lib/money";
import { PageHeader, Card, StatusBadge } from "@/components/crm/ui";
import { DataTable } from "@/components/crm/DataTable";

const STATUS_LABELS: Record<string, string> = {
  draft: "Ciornă",
  pending_payment: "Așteaptă plata",
  paid: "Plătită",
  in_production: "În producție",
  ready_to_ship: "Gata de livrare",
  shipped: "Expediată",
  completed: "Finalizată",
  cancelled: "Anulată",
  refunded: "Rambursată",
};

export default function CrmDashboardPage() {
  const router = useRouter();
  const { data: stats, isLoading } = useCrmSingleton<CrmStats>("stats");

  if (isLoading || !stats) {
    return <p className="text-muted text-sm">Se încarcă…</p>;
  }

  const active =
    (stats.orders_by_status["paid"] ?? 0) +
    (stats.orders_by_status["in_production"] ?? 0) +
    (stats.orders_by_status["ready_to_ship"] ?? 0);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Privire de ansamblu asupra atelierului" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <p className="text-[12px] tracking-[0.14em] uppercase text-muted mb-1">
            Venit luna aceasta
          </p>
          <p className="font-serif text-[26px]">{formatBani(stats.revenue_month)}</p>
        </Card>
        <Card>
          <p className="text-[12px] tracking-[0.14em] uppercase text-muted mb-1">
            Venit total
          </p>
          <p className="font-serif text-[26px]">{formatBani(stats.revenue_total)}</p>
        </Card>
        <Card>
          <p className="text-[12px] tracking-[0.14em] uppercase text-muted mb-1">
            Comenzi de lucrat
          </p>
          <p className="font-serif text-[26px]">{active}</p>
        </Card>
        <Card>
          <p className="text-[12px] tracking-[0.14em] uppercase text-muted mb-1">
            Produse / Articole
          </p>
          <p className="font-serif text-[26px]">
            {stats.counts.products}
            <span className="text-stone text-lg"> / {stats.counts.posts}</span>
          </p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] tracking-[0.16em] uppercase text-muted">
              Comenzi recente
            </h2>
            <Link href="/crm/orders" className="avelink text-[13px] text-olive">
              Toate comenzile →
            </Link>
          </div>
          <DataTable
            columns={[
              {
                key: "number",
                header: "Comandă",
                render: (o) => <span className="font-medium">{o.order_number}</span>,
              },
              { key: "email", header: "Client", render: (o) => o.email },
              {
                key: "status",
                header: "Status",
                render: (o) => (
                  <StatusBadge value={o.status} label={STATUS_LABELS[o.status]} />
                ),
              },
              {
                key: "total",
                header: "Total",
                className: "text-right",
                render: (o) => formatBani(o.total_amount),
              },
            ]}
            rows={stats.recent_orders}
            rowKey={(o) => o.id}
            onRowClick={(o) => router.push(`/crm/orders/${o.order_number}`)}
            empty="Nicio comandă încă."
          />
        </div>

        <div className="space-y-6">
          <Card title="Comenzi pe status">
            <ul className="space-y-2">
              {Object.entries(STATUS_LABELS).map(([status, label]) => {
                const count = stats.orders_by_status[status] ?? 0;
                if (!count) return null;
                return (
                  <li key={status} className="flex items-center justify-between text-sm">
                    <StatusBadge value={status} label={label} />
                    <span className="font-medium">{count}</span>
                  </li>
                );
              })}
              {Object.values(stats.orders_by_status).every((v) => !v) && (
                <li className="text-muted text-sm">Nicio comandă.</li>
              )}
            </ul>
          </Card>

          <Card title="Stoc redus">
            {stats.low_stock.length === 0 ? (
              <p className="text-muted text-sm">Totul în regulă.</p>
            ) : (
              <ul className="space-y-2">
                {stats.low_stock.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-sm gap-3">
                    <span className="truncate">
                      {v.product__title} — {v.name}
                    </span>
                    <span
                      className={`shrink-0 font-medium ${v.stock_quantity === 0 ? "text-red-700" : "text-gold"}`}
                    >
                      {v.stock_quantity} buc
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
