"use client";

import { use, useState } from "react";
import Link from "next/link";

import { CrmAddress, CrmOrderDetail } from "@/lib/crm-api";
import { useCrmDetail, useCrmUpdate } from "@/lib/crm-hooks";
import { formatBani } from "@/lib/money";
import {
  Button,
  Card,
  StatusBadge,
  TextArea,
  useToast,
} from "@/components/crm/ui";
import OrderWorkflow, {
  formatWhen,
  IssueInvoice,
  ShippingCard,
  StripeSyncButton,
} from "@/components/crm/OrderWorkflow";
import InvoiceActions from "@/components/crm/InvoiceActions";
import EmailHistory from "@/components/crm/EmailHistory";
import BillingEditor from "@/components/crm/BillingEditor";
import { ORDER_STATUS_LABELS } from "@/components/crm/orderStatus";

const EVENT_LABELS: Record<string, string> = {
  placed: "Comandă plasată",
  shipping_updated: "Date expediere actualizate",
  billing_updated: "Facturare actualizată",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "În așteptare",
  succeeded: "Încasată",
  failed: "Eșuată",
  cancelled: "Anulată",
  refunded: "Rambursată",
};

const PROVIDER_LABELS: Record<string, string> = {
  stripe: "Card (Stripe)",
  cash: "Ramburs",
  bank_transfer: "Transfer bancar",
};


function AddressBlock({ title, address }: { title: string; address: CrmAddress | null }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.14em] uppercase text-muted mb-1.5">{title}</p>
      {address ? (
        <p className="text-sm leading-relaxed">
          {address.is_company && <><strong>{address.company_name}</strong><br />CIF: {address.cui}<br /></>}
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

  const [notesDraft, setNotes] = useState<string | null>(null);
  const notes = notesDraft ?? order?.internal_notes ?? "";

  if (isLoading || !order) {
    return <p className="text-muted text-sm">Se încarcă…</p>;
  }
  const cash = order.payments.some((payment) => payment.provider === "cash");

  return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-[28px] sm:text-[32px] leading-tight">{order.order_number}</h1>
            <StatusBadge value={order.status} label={ORDER_STATUS_LABELS[order.status]} />
            {order.paid_at ? (
              <StatusBadge value="succeeded" label="Plătită" />
            ) : !["cancelled", "refunded"].includes(order.status) && (
              <StatusBadge value="pending_payment" label={cash ? "Ramburs neîncasat" : "Neplătită"} />
            )}
          </div>
          <p className="text-[13px] text-muted mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            <span className="text-ink font-medium">{formatBani(order.total_amount)}</span>
            <span>{order.email}</span>
            {order.phone && <span>{order.phone}</span>}
            {order.placed_at && <span>Plasată {formatWhen(order.placed_at)}</span>}
          </p>
        </div>
        <Link href="/crm/orders" className="avelink text-[13px] text-olive shrink-0 sm:mt-2">
          ← Toate comenzile
        </Link>
      </header>

      <OrderWorkflow order={order} />

      <div id="detalii" className="grid lg:grid-cols-3 gap-6 items-start scroll-mt-6">
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
                    <tr key={p.id} className="border-b border-ink/5 last:border-0 align-top">
                      <td className="py-2.5 pr-3">
                        {PROVIDER_LABELS[p.provider] ?? p.provider}
                        {p.stripe_payment_intent_id && (
                          <span className="block text-[11px] text-stone font-mono">{p.stripe_payment_intent_id}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge value={p.status} label={PAYMENT_STATUS_LABELS[p.status]} />
                      </td>
                      <td className="py-2.5 pr-3 text-muted text-[12px]">{formatWhen(p.updated_at)}</td>
                      <td className="py-2.5 text-right font-medium">{formatBani(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {order.payments.some((p) => p.provider === "stripe") && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-4">
                <p className="text-[12px] text-muted">Starea plăților online este preluată direct din Stripe.</p>
                <StripeSyncButton order={order} />
              </div>
            )}
          </Card>

          {/* Invoices */}
          <Card title={`Facturi (${order.invoices.length})`}>
            {order.invoices.length === 0 ? (
              <IssueInvoice order={order} />
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
                      <InvoiceActions invoice={inv} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Istoric emailuri"><EmailHistory emails={order.emails} /></Card>
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
              Plasată: {order.placed_at ? formatWhen(order.placed_at) : "—"}
              <br />
              Plătită: {order.paid_at ? formatWhen(order.paid_at) : "—"}
            </p>
          </Card>

          <Card title="Client și adrese">
            <div className="space-y-4">
              <AddressBlock title="Livrare" address={order.shipping_address} />
              <AddressBlock title="Facturare" address={order.billing_address} />
              <BillingEditor key={order.billing_address?.id} order={order} />
            </div>
          </Card>

          {order.customer_notes && (
            <Card title="Notele clientului">
              <p className="text-sm whitespace-pre-wrap">{order.customer_notes}</p>
            </Card>
          )}

          <Card title="Expediere">
            <ShippingCard key={`${order.awb}:${order.courier}:${order.tracking_url}`} order={order} />
          </Card>

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

          <Card title="Istoric etape">
            {!order.events.length && <p className="text-sm text-muted">Nu există evenimente înregistrate.</p>}
            <ol className="space-y-3">
              {order.events.map((event) => (
                <li key={event.id} className="border-b border-ink/8 last:border-0 pb-2 text-sm">
                  <p>{ORDER_STATUS_LABELS[event.key as keyof typeof ORDER_STATUS_LABELS] ?? EVENT_LABELS[event.key] ?? event.key}</p>
                  <p className="text-xs text-muted">
                    {formatWhen(event.created_at)}
                    {event.actor_name && ` · ${event.actor_name}`}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
