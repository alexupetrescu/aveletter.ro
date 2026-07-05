"use client";

import { useState } from "react";
import Link from "next/link";

import { CrmInvoice, CrmInvoiceSeries, Paginated } from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import { formatBani } from "@/lib/money";
import {
  Button,
  Card,
  Checkbox,
  Field,
  PageHeader,
  StatusBadge,
  TextInput,
  useToast,
} from "@/components/crm/ui";
import { DataTable } from "@/components/crm/DataTable";

function InvoiceSnapshotModal({
  invoice,
  onClose,
}: {
  invoice: CrmInvoice;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-ink/40 grid place-items-center p-6" onClick={onClose}>
      <div
        className="bg-paper border border-ink/10 rounded-sm w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink/10">
          <div>
            <h2 className="font-serif text-xl">{invoice.number_display}</h2>
            <p className="text-[12px] text-muted">
              {new Date(invoice.issued_at).toLocaleString("ro-RO")} · comanda{" "}
              <Link href={`/crm/orders/${invoice.order_number}`} className="avelink text-olive">
                {invoice.order_number}
              </Link>
            </p>
          </div>
          <Button variant="subtle" onClick={onClose}>
            Închide
          </Button>
        </div>
        <div className="px-5 py-3 border-b border-ink/10 flex items-center gap-6 text-sm">
          <span>
            Net: <strong>{formatBani(invoice.net_amount)}</strong>
          </span>
          <span>
            TVA: <strong>{formatBani(invoice.vat_amount)}</strong>
          </span>
          <span>
            Total: <strong>{formatBani(invoice.gross_amount)}</strong>
          </span>
          <StatusBadge value={invoice.efactura_status} label={`e-Factura: ${invoice.efactura_status}`} />
        </div>
        <pre className="flex-1 overflow-auto text-[11px] leading-relaxed p-5 bg-ink/3">
          {JSON.stringify(invoice.snapshot, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function SeriesPanel() {
  const toast = useToast();
  const { data: series, isLoading } = useCrmList<CrmInvoiceSeries[]>("invoice-series");
  const create = useCrmCreate<CrmInvoiceSeries>("invoice-series");
  const update = useCrmUpdate<CrmInvoiceSeries>("invoice-series");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  return (
    <Card title="Serii de facturare">
      {isLoading ? (
        <p className="text-muted text-sm">Se încarcă…</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {series?.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 border border-ink/10 rounded-sm px-3 py-2"
            >
              <span className="text-sm">
                <strong>{s.code}</strong>
                {s.name && <span className="text-muted"> · {s.name}</span>}
                <span className="text-muted"> · următorul nr: {s.next_number}</span>
              </span>
              <Checkbox
                label="Activă"
                checked={s.is_active}
                onChange={(v) =>
                  update.mutate(
                    { id: s.id, body: { is_active: v } },
                    {
                      onSuccess: () => toast("Seria a fost actualizată."),
                      onError: (err) => toast(err.message, "error"),
                    },
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <Field label="Cod" className="w-24">
          <TextInput
            value={code}
            maxLength={10}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Nume" className="flex-1">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button
          disabled={!code || create.isPending}
          onClick={() =>
            create.mutate(
              { code, name, is_active: true },
              {
                onSuccess: () => {
                  toast("Seria a fost creată.");
                  setCode("");
                  setName("");
                },
                onError: (err) => toast(err.message, "error"),
              },
            )
          }
        >
          Adaugă
        </Button>
      </div>
      <p className="text-[12px] text-muted mt-3">
        Numerotarea este secvențială și fără goluri — cerință legală. Numărul
        următor nu poate fi modificat manual.
      </p>
    </Card>
  );
}

export default function CrmInvoicesPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CrmInvoice | null>(null);
  const { data, isLoading } = useCrmList<Paginated<CrmInvoice>>("invoices", { page });

  return (
    <div>
      <PageHeader
        title="Facturi"
        subtitle="Documente fiscale emise — doar citire; corecțiile se fac prin storno"
      />
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <DataTable
            columns={[
              {
                key: "number",
                header: "Factură",
                render: (inv) => <span className="font-medium">{inv.number_display}</span>,
              },
              {
                key: "order",
                header: "Comandă",
                render: (inv) => inv.order_number,
              },
              {
                key: "issued",
                header: "Emisă",
                render: (inv) => new Date(inv.issued_at).toLocaleDateString("ro-RO"),
              },
              {
                key: "efactura",
                header: "e-Factura",
                render: (inv) => <StatusBadge value={inv.efactura_status} />,
              },
              {
                key: "total",
                header: "Total",
                className: "text-right",
                render: (inv) => formatBani(inv.gross_amount),
              },
            ]}
            rows={data?.results ?? []}
            rowKey={(inv) => inv.id}
            onRowClick={setSelected}
            isLoading={isLoading}
            empty="Nicio factură emisă încă."
            page={page}
            hasNext={Boolean(data?.next)}
            hasPrevious={Boolean(data?.previous)}
            onPageChange={setPage}
            totalCount={data?.count}
          />
        </div>
        <SeriesPanel />
      </div>
      {selected && (
        <InvoiceSnapshotModal invoice={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
