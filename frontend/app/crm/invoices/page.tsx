"use client";

import { useState } from "react";
import Link from "next/link";

import { crm, CrmInvoice, CrmInvoiceSeries, Paginated } from "@/lib/crm-api";
import { useQueryClient } from "@tanstack/react-query";
import InvoiceActions, { PdfPreview } from "@/components/crm/InvoiceActions";
import EmailHistory, { EMAIL_STATUS } from "@/components/crm/EmailHistory";
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
        <div className="flex-1 overflow-auto p-5 space-y-5">
          <p className="text-sm">Scadență: {invoice.due_date ? new Date(`${invoice.due_date}T12:00:00`).toLocaleDateString("ro-RO") : "—"}</p>
          <InvoiceActions invoice={invoice} />
          <EmailHistory emails={invoice.emails} />
        </div>
      </div>
    </div>
  );
}

function IssueInvoicePanel() {
  const [number, setNumber] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<CrmInvoice | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  async function issue() {
    setBusy(true);
    try {
      setIssued(await crm.post<CrmInvoice>(`/orders/${encodeURIComponent(number.trim())}/issue-invoice/`, {}));
      await qc.invalidateQueries({ queryKey: ["crm", "invoices"] });
      toast("Factura este emisă.");
    } catch (error) { toast(error instanceof Error ? error.message : "Emiterea a eșuat.", "error"); }
    finally { setBusy(false); }
  }
  return <Card title="Emite factură pentru o comandă">
    <Field label="Număr comandă"><TextInput placeholder="AVE-…" value={number} onChange={(event) => { setNumber(event.target.value); setIssued(null); }} /></Field>
    <div className="flex flex-wrap gap-2 mt-4"><Button variant="subtle" disabled={!number.trim()} onClick={() => setPreview(true)}>Previzualizează</Button><Button disabled={busy || !number.trim()} onClick={issue}>Emite factura</Button></div>
    {issued && <p className="text-sm text-olive mt-3">Factura {issued.number_display} este disponibilă în listă. Deschide-o pentru PDF și trimitere.</p>}
    {preview && <PdfPreview path={`/orders/${encodeURIComponent(number.trim())}/invoice-preview/`} onClose={() => setPreview(false)} />}
  </Card>;
}

function SeriesPanel() {
  const toast = useToast();
  const { data: series, isLoading } = useCrmList<CrmInvoiceSeries[]>("invoice-series");
  const create = useCrmCreate<CrmInvoiceSeries>("invoice-series");
  const update = useCrmUpdate<CrmInvoiceSeries>("invoice-series");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [nextNumber, setNextNumber] = useState(1);

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
        <Field label="Primul număr" className="w-28"><TextInput type="number" min={1} value={nextNumber} onChange={(event) => setNextNumber(Number(event.target.value))} /></Field>
        <Button
          disabled={!code || create.isPending}
          onClick={() =>
            create.mutate(
              { code, name, next_number: nextNumber, is_active: true },
              {
                onSuccess: () => {
                  toast("Seria a fost creată.");
                  setCode("");
                  setName("");
                  setNextNumber(1);
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
        Numărul este alocat la emitere. După prima factură, codul și contorul seriei sunt protejate.
      </p>
    </Card>
  );
}

export default function CrmInvoicesPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CrmInvoice | null>(null);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useCrmList<Paginated<CrmInvoice>>("invoices", { page, search });

  return (
    <div>
      <PageHeader
        title="Facturi"
        subtitle="Emitere, previzualizare PDF și trimitere pe email"
      />
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <TextInput className="mb-4" placeholder="Caută după comandă, email, serie sau număr…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
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
                key: "email",
                header: "Email client",
                render: (inv) => inv.emails[0] ? EMAIL_STATUS[inv.emails[0].status] : "Netrimis",
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
        <div className="space-y-6"><IssueInvoicePanel /><SeriesPanel /></div>
      </div>
      {selected && (
        <InvoiceSnapshotModal invoice={data?.results.find((invoice) => invoice.id === selected.id) ?? selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
