"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

import { CrmAddress, CrmOrderDetail, OrderStatus } from "@/lib/crm-api";
import { useCrmDetail, useCrmUpdate } from "@/lib/crm-hooks";
import { formatBani } from "@/lib/money";
import {
  Button,
  Card,
  PageHeader,
  StatusBadge,
  TextArea,
  useToast,
} from "@/components/crm/ui";
import {
  NEXT_STATUSES,
  ORDER_FLOW,
  ORDER_STATUS_LABELS,
} from "@/components/crm/orderStatus";

function AddressBlock({ title, address }: { title: string; address: CrmAddress | null }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.14em] uppercase text-muted mb-1.5">{title}</p>
      {address ? (
        <p className="text-sm leading-relaxed">
          {address.full_name}
          <br />
          {address.line1}
          {address.line2 && (
            <>
              <br />
              {address.line2}
            </>
          )}
          <br />
          {address.city}
          {address.county && `, ${address.county}`} {address.postal_code}
          <br />
          <span className="text-muted">{address.phone}</span>
        </p>
      ) : (
        <p className="text-sm text-muted">—</p>
      )}
    </div>
  );
}

function SnapshotViewer({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[12px] text-olive avelink cursor-pointer"
      >
        {open ? `▾ ${label}` : `▸ ${label}`}
      </button>
      {open && (
        <pre className="mt-2 text-[11px] leading-relaxed bg-ink/5 border border-ink/10 rounded-sm p-3 overflow-x-auto max-h-80">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function CrmOrderDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = use(params);
  const toast = useToast();
  const { data: order, isLoading } = useCrmDetail<CrmOrderDetail>("orders", number);
  const update = useCrmUpdate<CrmOrderDetail>("orders");

  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (order) setNotes(order.internal_notes);
  }, [order]);

  if (isLoading || !order) {
    return <p className="text-muted text-sm">Se încarcă…</p>;
  }

  const flowIndex = ORDER_FLOW.indexOf(order.status);
  const nextStatuses = NEXT_STATUSES[order.status] ?? [];

  function transition(status: OrderStatus) {
    update.mutate(
      { id: number, body: { status } },
      {
        onSuccess: () =>
          toast(`Comanda a trecut la „${ORDER_STATUS_LABELS[status]}".`),
        onError: (err) => toast(err.message, "error"),
      },
    );
  }

  return (
    <div>
      <PageHeader
        title={order.order_number}
        subtitle={`${order.email}${order.phone ? ` · ${order.phone}` : ""}`}
        actions={
          <Link href="/crm/orders" className="avelink text-[13px] text-olive self-center">
            ← Toate comenzile
          </Link>
        }
      />

      {/* Status timeline + transitions */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-1 mb-4">
          {ORDER_FLOW.map((step, i) => (
            <div key={step} className="flex items-center gap-1">
              {i > 0 && <span className="w-6 h-px bg-ink/15" />}
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] tracking-wide uppercase border ${
                  i < flowIndex
                    ? "border-olive/40 text-olive bg-olive/5"
                    : i === flowIndex
                      ? "bg-ink text-paper border-ink"
                      : "border-ink/15 text-stone"
                }`}
              >
                {ORDER_STATUS_LABELS[step]}
              </span>
            </div>
          ))}
          {(order.status === "cancelled" || order.status === "refunded") && (
            <StatusBadge value={order.status} label={ORDER_STATUS_LABELS[order.status]} />
          )}
        </div>
        {nextStatuses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted mr-1">Schimbă statusul:</span>
            {nextStatuses.map((status) => (
              <Button
                key={status}
                variant={
                  status === "cancelled" || status === "refunded" ? "danger" : "subtle"
                }
                disabled={update.isPending}
                onClick={() => transition(status)}
              >
                {ORDER_STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Lines */}
          <Card title={`Produse (${order.lines.length})`}>
            <div className="space-y-5">
              {order.lines.map((line) => (
                <div key={line.id} className="border-b border-ink/8 last:border-0 pb-5 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-[15px]">
                        {line.product_title}
                        {line.variant_name && (
                          <span className="text-muted font-normal"> — {line.variant_name}</span>
                        )}
                      </p>
                      <p className="text-[12px] text-muted mt-0.5">
                        {line.quantity} × {formatBani(line.unit_price_amount)}
                        {line.sku && ` · SKU ${line.sku}`}
                        {line.vat_is_exempt
                          ? ` · ${line.vat_legal_mention || "Neplătitor de TVA"}`
                          : ` · TVA ${line.vat_rate_bp / 100}%`}
                      </p>
                    </div>
                    <p className="font-medium shrink-0">{formatBani(line.line_total_amount)}</p>
                  </div>

                  {line.selected_options_snapshot.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {line.selected_options_snapshot.map((opt, i) => (
                        <li key={i} className="text-[13px] text-soft">
                          {opt.group}: <span className="text-ink">{opt.label}</span>
                          {opt.price_delta_amount !== 0 && (
                            <span className="text-muted">
                              {" "}({opt.price_delta_amount > 0 ? "+" : ""}
                              {formatBani(opt.price_delta_amount)})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {Object.keys(line.inputs_snapshot).length > 0 && (
                    <div className="mt-2 bg-gold/5 border border-gold/20 rounded-sm px-3 py-2 space-y-1">
                      {Object.entries(line.inputs_snapshot).map(([key, value]) => (
                        <p key={key} className="text-[13px]">
                          <span className="text-muted">{key.replace(/^_/, "")}: </span>
                          <span className="whitespace-pre-wrap break-words">
                            {typeof value === "object" ? JSON.stringify(value) : String(value)}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="mt-2">
                    <SnapshotViewer label="Detalii preț (snapshot)" data={line.price_breakdown} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Payments */}
          <Card title={`Plăți (${order.payments.length})`}>
            {order.payments.length === 0 ? (
              <p className="text-muted text-sm">Nicio plată înregistrată.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {order.payments.map((p) => (
                    <tr key={p.id} className="border-b border-ink/5 last:border-0">
                      <td className="py-2 pr-3 capitalize">{p.provider}</td>
                      <td className="py-2 pr-3">
                        <StatusBadge value={p.status} />
                      </td>
                      <td className="py-2 pr-3 text-muted text-[12px]">
                        {new Date(p.created_at).toLocaleString("ro-RO")}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatBani(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Invoices */}
          <Card title={`Facturi (${order.invoices.length})`}>
            {order.invoices.length === 0 ? (
              <p className="text-muted text-sm">
                Factura se emite automat la marcarea plății.
              </p>
            ) : (
              <div className="space-y-4">
                {order.invoices.map((inv) => (
                  <div key={inv.id} className="border-b border-ink/8 last:border-0 pb-4 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{inv.number_display}</p>
                        <p className="text-[12px] text-muted">
                          {new Date(inv.issued_at).toLocaleDateString("ro-RO")} ·{" "}
                          {inv.kind === "storno" ? "Storno" : "Factură"} · e-Factura:{" "}
                          {inv.efactura_status}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium">{formatBani(inv.gross_amount)}</p>
                        <p className="text-[12px] text-muted">
                          net {formatBani(inv.net_amount)} · TVA {formatBani(inv.vat_amount)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <SnapshotViewer label="Snapshot fiscal" data={inv.snapshot} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Sumar">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd>{formatBani(order.subtotal_amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Livrare</dt>
                <dd>{formatBani(order.shipping_amount)}</dd>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">Reducere</dt>
                  <dd>-{formatBani(order.discount_amount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">TVA</dt>
                <dd>
                  {order.vat_enabled_snapshot
                    ? formatBani(order.vat_amount)
                    : "Neplătitor de TVA"}
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink/10 pt-2 mt-2 font-medium text-base">
                <dt>Total</dt>
                <dd>{formatBani(order.total_amount)}</dd>
              </div>
            </dl>
            <p className="text-[12px] text-muted mt-3">
              Plasată:{" "}
              {order.placed_at ? new Date(order.placed_at).toLocaleString("ro-RO") : "—"}
              <br />
              Plătită: {order.paid_at ? new Date(order.paid_at).toLocaleString("ro-RO") : "—"}
            </p>
          </Card>

          <Card title="Adrese">
            <div className="space-y-4">
              <AddressBlock title="Livrare" address={order.shipping_address} />
              <AddressBlock title="Facturare" address={order.billing_address} />
            </div>
          </Card>

          {order.customer_notes && (
            <Card title="Notele clientului">
              <p className="text-sm whitespace-pre-wrap">{order.customer_notes}</p>
            </Card>
          )}

          <Card title="Note interne">
            <TextArea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vizibile doar în atelier…"
            />
            <Button
              className="mt-3"
              disabled={update.isPending || notes === order.internal_notes}
              onClick={() =>
                update.mutate(
                  { id: number, body: { internal_notes: notes } },
                  {
                    onSuccess: () => toast("Notele au fost salvate."),
                    onError: (err) => toast(err.message, "error"),
                  },
                )
              }
            >
              Salvează notele
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
