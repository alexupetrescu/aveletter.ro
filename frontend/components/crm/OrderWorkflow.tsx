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

function EmailNote({ email }: { email?: CrmEmail }) {
  if (!email) return null;
  return <span className={EMAIL_TONE[email.status]}>
    Email {EMAIL_STATUS[email.status].toLowerCase()}{email.sent_at && ` · ${formatWhen(email.sent_at)}`}
  </span>;
}

function Dot({ state }: { state: "done" | "current" | "next" | "warn" | "upcoming" | "muted" }) {
  const styles = {
    done: "bg-olive border-olive text-paper",
    current: "bg-paper border-olive ring-4 ring-olive/15",
    next: "bg-paper border-ink/40 border-dashed",
    warn: "bg-gold/15 border-gold text-gold",
    upcoming: "bg-paper border-ink/15",
    muted: "bg-ink/5 border-ink/10",
  }[state];
  return <span className={`relative z-10 grid place-items-center h-7 w-7 shrink-0 rounded-full border-2 text-[13px] ${styles}`}>
    {state === "done" ? "✓" : state === "warn" ? "!" : state === "current" ? <span className="h-2.5 w-2.5 rounded-full bg-olive" /> : null}
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
  const actorOf = (step: OrderStatus) => order.events.find((event) => event.to_status === step && event.actor_name)?.actor_name;

  const cash = isCash(order);
  const stopped = order.status === "cancelled" || order.status === "refunded";
  const reached = ORDER_FLOW.includes(order.status)
    ? ORDER_FLOW.indexOf(order.status)
    : Math.max(0, ...order.events.map((event) => ORDER_FLOW.indexOf(event.to_status as OrderStatus)));
  const next = ORDER_FLOW.find((step) => step !== "paid" && order.allowed_transitions.includes(step));
  const advancedUnpaid = !order.paid_at && !cash && !stopped && reached > 1;
  const canRecordPayment = !order.paid_at && !stopped && order.status !== "draft"
    && order.payments.some((payment) => ["cash", "bank_transfer"].includes(payment.provider) && payment.status === "pending");
  const canCancel = order.allowed_transitions.includes("cancelled");
  const canRefund = order.allowed_transitions.includes("refunded") && order.payments.some((payment) => payment.status === "succeeded");

  const advance = (step: OrderStatus) => run("/", {
    ...(step === "shipped" ? shipping : {}), status: step, expected_status: order.status, send_email: enabled(step),
  }, "patch");

  function paidStep() {
    if (order.paid_at) return { state: "done" as const, note: `${cash ? "Încasată ramburs" : "Încasată online"} · ${formatWhen(order.paid_at)}` };
    if (stopped) return { state: "muted" as const, note: "Neîncasată" };
    if (cash) return {
      state: reached > 0 ? "warn" as const : "upcoming" as const,
      note: "Ramburs — se încasează la livrare",
      action: canRecordPayment && <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Button variant="subtle" disabled={busy || !templates} onClick={() => {
          if (window.confirm("Confirmi că ai încasat plata integrală?")) run("/record-payment/", { confirmed: true, send_email: enabled("paid") });
        }}>Înregistrează plata încasată</Button>
        {emailToggle("paid")}
      </div>,
    };
    return {
      state: advancedUnpaid ? "warn" as const : "next" as const,
      note: advancedUnpaid ? "Stripe nu a confirmat plata, deși comanda a avansat." : "Se confirmă automat când Stripe primește banii.",
      action: <StripeSyncButton order={order} />,
    };
  }

  return <section className="flex flex-col w-full max-w-3xl min-h-[calc(100svh-7rem)] lg:min-h-[calc(100svh-6rem)] mb-10">
    {stopped && <div className="mb-5 border border-red-200 bg-red-50 text-red-800 rounded-sm px-5 py-3 text-sm flex flex-wrap justify-between gap-2">
      <span><strong>{ORDER_STATUS_LABELS[order.status]}</strong>{reachedAt(order.status) && ` · ${formatWhen(reachedAt(order.status)!)}`}{actorOf(order.status) && ` · ${actorOf(order.status)}`}</span>
      <EmailNote email={latestEmail(order.status)} />
    </div>}
    {advancedUnpaid && <div className="mb-5 border border-gold/40 bg-gold/10 rounded-sm px-5 py-3 text-sm">
      Comanda a avansat fără ca plata Stripe să fie confirmată. Verifică la pasul „Plătită” de mai jos.
    </div>}

    <ol className="flex-1 flex flex-col">
      {ORDER_FLOW.map((step, index) => {
        const last = index === ORDER_FLOW.length - 1;
        const isNext = step === next && !stopped;
        const paid = step === "paid" ? paidStep() : null;
        const state = paid?.state ?? (stopped ? (index <= reached ? "done" : "muted")
          : index < reached ? "done" : index === reached ? "current" : isNext ? "next" : "upcoming");
        const when = reachedAt(step);
        const email = latestEmail(step === "pending_payment" ? "placed" : step);
        const lineDone = index < reached;
        return <li key={step} className="relative flex gap-4 sm:gap-5 flex-1 min-h-[76px]">
          {!last && <span className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${lineDone ? "bg-olive/60" : "bg-ink/10"}`} />}
          <Dot state={state} />
          <div className={`flex-1 min-w-0 pb-6 ${isNext ? "-mt-3" : ""}`}>
            <div className={isNext ? "border border-olive/40 bg-olive/5 rounded-sm p-4 sm:p-5" : ""}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className={`text-[17px] ${state === "upcoming" || state === "muted" ? "text-muted" : "text-ink"} ${state === "current" || isNext ? "font-medium" : ""}`}>
                  {ORDER_STATUS_LABELS[step]}
                </h3>
                {state === "current" && <span className="text-[11px] tracking-[0.14em] uppercase text-olive">Acum</span>}
                {isNext && <span className="text-[11px] tracking-[0.14em] uppercase text-muted">Următorul pas</span>}
              </div>
              <p className="text-[12.5px] text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {paid?.note ? <span className={paid.state === "warn" ? "text-gold" : ""}>{paid.note}</span>
                  : when && <span>{formatWhen(when)}{actorOf(step) && ` · ${actorOf(step)}`}</span>}
                <EmailNote email={email} />
              </p>

              {paid?.action && <div className="mt-3">{paid.action}</div>}

              {isNext && <>
                {step === "shipped" && <div className="grid sm:grid-cols-2 gap-3 mt-4">
                  <Field label="AWB *"><TextInput maxLength={100} value={shipping.awb} onChange={(e) => setShipping({ ...shippingDraft, awb: e.target.value })} /></Field>
                  <Field label="Curier"><TextInput maxLength={100} value={shipping.courier} onChange={(e) => setShipping({ ...shippingDraft, courier: e.target.value })} /></Field>
                  <Field label="Link urmărire (opțional)" className="sm:col-span-2"><TextInput type="url" value={shipping.tracking_url} onChange={(e) => setShipping({ ...shippingDraft, tracking_url: e.target.value })} /></Field>
                </div>}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4">
                  <Button disabled={busy || !templates || (step === "shipped" && !shipping.awb.trim())} onClick={() => advance(step)}>
                    Marchează „{ORDER_STATUS_LABELS[step]}”
                  </Button>
                  {emailToggle(step)}
                </div>
              </>}

              {!isNext && state === "upcoming" && step !== "pending_payment" && step !== "paid" && <div className="mt-2 opacity-80">
                {emailToggle(step, "Trimite email la acest pas")}
              </div>}
            </div>
          </div>
        </li>;
      })}
    </ol>

    {(canCancel || canRefund) && <div className="mt-2 border-t border-ink/10 pt-5 flex flex-wrap items-center gap-x-8 gap-y-4">
      <p className="text-[11px] tracking-[0.16em] uppercase text-muted w-full sm:w-auto">Ieșiri din flux</p>
      {canCancel && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="danger" disabled={busy || !templates} onClick={() => {
          if (window.confirm("Anulezi comanda?")) advance("cancelled");
        }}>Anulează comanda</Button>
        {emailToggle("cancelled", "Email")}
      </div>}
      {canRefund && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="danger" disabled={busy || !templates} onClick={() => {
          if (window.confirm("Confirmi că rambursarea integrală a fost deja efectuată? Acest buton doar o înregistrează, nu transferă bani.")) run("/record-refund/", { confirmed: true, send_email: enabled("refunded") });
        }}>Înregistrează rambursarea</Button>
        {emailToggle("refunded", "Email")}
      </div>}
    </div>}

    <a href="#detalii" className="self-center mt-8 text-[11px] tracking-[0.18em] uppercase text-muted hover:text-ink">
      Detalii comandă ↓
    </a>
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
