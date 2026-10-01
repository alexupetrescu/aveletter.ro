"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { crm, type CrmEmail, type CrmEmailTemplate, type CrmOrderDetail, type OrderStatus } from "@/lib/crm-api";
import { useCrmList } from "@/lib/crm-hooks";
import { ORDER_FLOW, ORDER_STATUS_LABELS } from "./orderStatus";
import { Button, Checkbox, Field, TextInput, useToast } from "./ui";
import { EMAIL_STATUS } from "./EmailHistory";
import { PdfPreview } from "./InvoiceActions";

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("ro-RO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const EMAIL_TONE: Record<CrmEmail["status"], string> = {
  sent: "text-olive", pending: "text-gold", sending: "text-gold",
  failed: "text-red-700", uncertain: "text-red-700", skipped: "text-stone",
};

/** Runs an order action, refreshes CRM caches and reports the outcome. */
export function useOrderAction(order: CrmOrderDetail) {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const root = `/orders/${order.order_number}`;
  async function run<T = unknown>(path: string, body: unknown, method: "post" | "patch" = "post", success = "Comanda a fost actualizată.") {
    setBusy(true);
    try {
      const result = await crm[method]<T>(`${root}${path}`, body);
      await Promise.all(["orders", "invoices"].map((resource) => qc.invalidateQueries({ queryKey: ["crm", resource] })));
      if (success) toast(success);
      return result;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Operațiunea a eșuat.", "error");
    } finally { setBusy(false); }
  }
  return { busy, run, root };
}

const isCash = (order: CrmOrderDetail) => order.payments.some((payment) => payment.provider === "cash");
const hasStripeSession = (order: CrmOrderDetail) =>
  order.payments.some((p) => p.provider === "stripe" && p.stripe_checkout_session_id && ["pending", "cancelled"].includes(p.status));

export function StripeSyncButton({ order, label = "Verifică la Stripe" }: { order: CrmOrderDetail; label?: string }) {
  const { busy, run } = useOrderAction(order);
  const toast = useToast();
  return <Button variant="subtle" disabled={busy} onClick={async () => {
    const result = await run<{ changed: number }>("/sync-stripe/", {}, "post", "");
    if (result) toast(result.changed ? "Plata a fost actualizată din Stripe." : "Stripe nu raportează nicio plată nouă.");
  }}>{busy ? "Se verifică…" : label}</Button>;
}

/** Silently reconciles unsettled Stripe sessions once when the order is opened. */
function useAutoStripeSync(order: CrmOrderDetail) {
  const done = useRef(false);
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    if (done.current || order.paid_at || ["cancelled", "refunded"].includes(order.status) || !hasStripeSession(order)) return;
    done.current = true;
    crm.post<{ changed: number }>(`/orders/${order.order_number}/sync-stripe/`, {})
      .then((result) => {
        if (!result.changed) return;
        qc.invalidateQueries({ queryKey: ["crm", "orders"] });
        toast("Stripe a confirmat plata acestei comenzi.");
      })
      .catch(() => null);
  }, [order, qc, toast]);
}

const EMAIL_TITLE = (email: CrmEmail) =>
  `Email ${EMAIL_STATUS[email.status].toLowerCase()}${email.sent_at ? ` · ${formatWhen(email.sent_at)}` : ""}`;

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });

type StepState = "done" | "current" | "warn" | "upcoming" | "muted";

function Dot({ state }: { state: StepState }) {
  const styles = {
    done: "bg-olive border-olive text-paper",
    current: "bg-paper border-olive ring-4 ring-olive/15",
    warn: "bg-gold/15 border-gold text-gold",
    upcoming: "bg-paper border-ink/15",
    muted: "bg-ink/5 border-ink/10",
  }[state];
  return <span className={`relative z-10 grid place-items-center h-6 w-6 rounded-full border-2 text-[11px] leading-none ${styles}`}>
    {state === "done" ? "✓" : state === "warn" ? "!" : state === "current" ? <span className="h-2 w-2 rounded-full bg-olive" /> : null}
  </span>;
}

export default function OrderWorkflow({ order }: { order: CrmOrderDetail }) {
  const { data: templates } = useCrmList<CrmEmailTemplate[]>("email-templates");
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [shippingDraft, setShipping] = useState<Partial<Record<"awb" | "courier" | "tracking_url", string>>>({});
  const shipping = {
    awb: shippingDraft.awb ?? order.awb,
    courier: shippingDraft.courier ?? order.courier,
    tracking_url: shippingDraft.tracking_url ?? order.tracking_url,
  };
  const { busy, run } = useOrderAction(order);
  useAutoStripeSync(order);

  const enabled = (key: string) => preferences[key] ?? templates?.find((template) => template.key === key)?.enabled ?? true;
  const emailToggle = (key: string, label = "Trimite email clientului") =>
    <Checkbox label={label} checked={enabled(key)} onChange={(value) => setPreferences({ ...preferences, [key]: value })} />;
  const latestEmail = (key: string) => order.emails.filter((email) => email.template_key === key)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const reachedAt = (step: OrderStatus) => {
    if (step === "pending_payment") return order.placed_at;
    if (step === "paid") return order.paid_at;
    return order.events.filter((event) => event.to_status === step).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.created_at ?? null;
  };

  const cash = isCash(order);
  const stopped = order.status === "cancelled" || order.status === "refunded";
  const reached = ORDER_FLOW.includes(order.status)
    ? ORDER_FLOW.indexOf(order.status)
    : Math.max(0, ...order.events.map((event) => ORDER_FLOW.indexOf(event.to_status as OrderStatus)));
  const next = stopped ? undefined : ORDER_FLOW.find((step) => step !== "paid" && order.allowed_transitions.includes(step));
  const awaitingStripe = !order.paid_at && !cash && !stopped && reached <= 1;
  const advancedUnpaid = !order.paid_at && !cash && !stopped && reached > 1;
  const canRecordPayment = !order.paid_at && !stopped && order.status !== "draft"
    && order.payments.some((payment) => ["cash", "bank_transfer"].includes(payment.provider) && payment.status === "pending");
  const canCancel = order.allowed_transitions.includes("cancelled");
  const canRefund = order.allowed_transitions.includes("refunded") && order.payments.some((payment) => payment.status === "succeeded");

  const stateOf = (step: OrderStatus, index: number): StepState => {
    if (step === "paid" && !order.paid_at) return stopped ? "muted" : index < reached || cash && reached > 0 ? "warn" : "upcoming";
    if (stopped) return index <= reached ? "done" : "muted";
    return index < reached ? "done" : index === reached ? "current" : "upcoming";
  };
  const advance = (step: OrderStatus) => run("/", {
    ...(step === "shipped" ? shipping : {}), status: step, expected_status: order.status, send_email: enabled(step),
  }, "patch");

  return <section className="mb-6 border border-ink/10 bg-white/70 rounded-sm">
    <ol className="grid grid-cols-6 px-2 sm:px-4 pt-4 pb-3">
      {ORDER_FLOW.map((step, index) => {
        const state = stateOf(step, index);
        const when = reachedAt(step);
        const email = latestEmail(step === "pending_payment" ? "placed" : step);
        return <li key={step} className="relative flex flex-col items-center text-center min-w-0"
          title={[ORDER_STATUS_LABELS[step], when && formatWhen(when), email && EMAIL_TITLE(email)].filter(Boolean).join(" · ")}>
          {index < ORDER_FLOW.length - 1 && <span className={`absolute top-[11px] left-1/2 w-full h-0.5 ${index < reached ? "bg-olive/60" : "bg-ink/10"}`} />}
          <Dot state={state} />
          <span className={`mt-1.5 text-[12px] leading-tight hidden sm:block ${state === "current" ? "font-medium text-ink" : state === "upcoming" || state === "muted" ? "text-muted" : "text-ink"}`}>
            {ORDER_STATUS_LABELS[step]}
          </span>
          <span className="text-[11px] text-stone leading-tight hidden sm:block min-h-[14px]">
            {when && shortDate(when)}
            {email && <span className={`ml-1 ${EMAIL_TONE[email.status]}`}>✉</span>}
          </span>
        </li>;
      })}
    </ol>
    <p className="sm:hidden text-center text-[13px] -mt-1 pb-3">
      <span className="text-muted">Pas {Math.min(reached, ORDER_FLOW.length - 1) + 1}/{ORDER_FLOW.length} · </span>
      <span className="font-medium">{ORDER_STATUS_LABELS[order.status]}</span>
    </p>

    <div className="border-t border-ink/8 px-4 sm:px-5 py-3.5 space-y-3">
      {stopped && <p className="text-sm text-red-700">
        <strong>{ORDER_STATUS_LABELS[order.status]}</strong>
        {reachedAt(order.status) && ` · ${formatWhen(reachedAt(order.status)!)}`}
        {latestEmail(order.status) && ` · ${EMAIL_TITLE(latestEmail(order.status)!)}`}
      </p>}

      {(awaitingStripe || advancedUnpaid) && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className={`text-sm ${advancedUnpaid ? "text-gold" : "text-muted"}`}>
          {advancedUnpaid ? "Comanda a avansat fără ca plata Stripe să fie confirmată." : "Plata online se confirmă automat când Stripe primește banii."}
        </p>
        <StripeSyncButton order={order} />
      </div>}

      {canRecordPayment && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-gold">Ramburs neîncasat</p>
        <Button variant="subtle" disabled={busy || !templates} onClick={() => {
          if (window.confirm("Confirmi că ai încasat plata integrală?")) run("/record-payment/", { confirmed: true, send_email: enabled("paid") });
        }}>Înregistrează plata încasată</Button>
        {emailToggle("paid")}
      </div>}

      {next && <div className="space-y-3">
        {next === "shipped" && <div className="grid sm:grid-cols-3 gap-3">
          <Field label="AWB *"><TextInput maxLength={100} value={shipping.awb} onChange={(e) => setShipping({ ...shippingDraft, awb: e.target.value })} /></Field>
          <Field label="Curier"><TextInput maxLength={100} value={shipping.courier} onChange={(e) => setShipping({ ...shippingDraft, courier: e.target.value })} /></Field>
          <Field label="Link urmărire"><TextInput type="url" value={shipping.tracking_url} onChange={(e) => setShipping({ ...shippingDraft, tracking_url: e.target.value })} /></Field>
        </div>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Button disabled={busy || !templates || (next === "shipped" && !shipping.awb.trim())} onClick={() => advance(next)}>
            Marchează „{ORDER_STATUS_LABELS[next]}”
          </Button>
          {emailToggle(next)}
        </div>
      </div>}

      {!next && !stopped && !awaitingStripe && order.status === "completed" && <p className="text-sm text-muted">Comanda este finalizată.</p>}

      {(canCancel || canRefund) && <details className="group text-sm">
        <summary className="cursor-pointer text-[12px] text-muted hover:text-ink list-none">
          <span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span> {canCancel && canRefund ? "Anulare sau rambursare" : canCancel ? "Anulare comandă" : "Rambursare"}
        </summary>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
          {canCancel && <>
            <Button variant="danger" disabled={busy || !templates} onClick={() => {
              if (window.confirm("Anulezi comanda?")) advance("cancelled");
            }}>Anulează comanda</Button>
            {emailToggle("cancelled")}
          </>}
          {canRefund && <>
            <Button variant="danger" disabled={busy || !templates} onClick={() => {
              if (window.confirm("Confirmi că rambursarea integrală a fost deja efectuată? Acest buton doar o înregistrează, nu transferă bani.")) run("/record-refund/", { confirmed: true, send_email: enabled("refunded") });
            }}>Înregistrează rambursarea</Button>
            {emailToggle("refunded")}
          </>}
        </div>
      </details>}
    </div>
  </section>;
}

export function ShippingCard({ order }: { order: CrmOrderDetail }) {
  const [awb, setAwb] = useState(order.awb);
  const [courier, setCourier] = useState(order.courier);
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url);
  const { busy, run } = useOrderAction(order);
  const dirty = awb !== order.awb || courier !== order.courier || trackingUrl !== order.tracking_url;
  return <>
    <div className="space-y-3">
      <Field label="AWB" hint="Obligatoriu la trecerea în Expediată."><TextInput maxLength={100} value={awb} onChange={(event) => setAwb(event.target.value)} /></Field>
      <Field label="Curier"><TextInput maxLength={100} value={courier} onChange={(event) => setCourier(event.target.value)} /></Field>
      <Field label="Link urmărire (opțional)"><TextInput type="url" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} /></Field>
    </div>
    {order.shipped_at && <p className="text-xs text-muted mt-3">Expediată la {formatWhen(order.shipped_at)}</p>}
    <div className="flex flex-wrap gap-2 mt-4">
      <Button variant="subtle" disabled={busy || !dirty} onClick={() => run("/", { awb, courier, tracking_url: trackingUrl }, "patch")}>Salvează</Button>
      {["shipped", "completed"].includes(order.status) && <Button variant="subtle" disabled={busy || !order.awb || dirty}
        onClick={() => run("/send-shipping-email/", { request_id: crypto.randomUUID(), resend: true })}>Retrimite emailul cu AWB</Button>}
    </div>
  </>;
}

export function IssueInvoice({ order }: { order: CrmOrderDetail }) {
  const [preview, setPreview] = useState(false);
  const { busy, run, root } = useOrderAction(order);
  return <>
    <p className="text-sm text-muted">Verifică datele și previzualizarea înainte de emitere. Numărul este alocat doar la emitere. Trimiterea pe email se face separat.</p>
    {order.invoice_error && <p className="text-sm text-red-700 mt-3">{order.invoice_error}</p>}
    <div className="flex gap-2 mt-4">
      <Button variant="subtle" onClick={() => setPreview(true)}>Previzualizează</Button>
      <Button disabled={busy || ["draft", "cancelled", "refunded"].includes(order.status)} onClick={() => run("/issue-invoice/", {})}>Emite factura</Button>
    </div>
    {preview && <PdfPreview path={`${root}/invoice-preview/`} onClose={() => setPreview(false)} />}
  </>;
}
