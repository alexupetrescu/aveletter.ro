"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { crm, type CrmEmailTemplate, type CrmOrderDetail, type OrderStatus } from "@/lib/crm-api";
import { useCrmList } from "@/lib/crm-hooks";
import { ORDER_FLOW, ORDER_STATUS_LABELS } from "./orderStatus";
import { Button, Card, Checkbox, Field, TextInput, useToast } from "./ui";
import { EMAIL_STATUS } from "./EmailHistory";
import { PdfPreview } from "./InvoiceActions";

export default function OrderWorkflow({ order }: { order: CrmOrderDetail }) {
  const { data: templates } = useCrmList<CrmEmailTemplate[]>("email-templates");
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [awb, setAwb] = useState(order.awb);
  const [courier, setCourier] = useState(order.courier);
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const root = `/orders/${order.order_number}`;
  const enabled = (key: string) => preferences[key] ?? templates?.find((template) => template.key === key)?.enabled ?? true;
  async function run(path: string, body: unknown, method: "post" | "patch" = "post") {
    setBusy(true);
    try {
      await crm[method](path, body);
      await Promise.all(["orders", "invoices"].map((resource) => qc.invalidateQueries({ queryKey: ["crm", resource] })));
      toast("Comanda a fost actualizată.");
    } catch (error) { toast(error instanceof Error ? error.message : "Operațiunea a eșuat.", "error"); }
    finally { setBusy(false); }
  }
  const shipping = { awb, courier, tracking_url: trackingUrl };
  const cash = order.payments.some((payment) => payment.provider === "cash");
  const canRecordPayment = !order.paid_at && order.payments.some((payment) => ["cash", "bank_transfer"].includes(payment.provider) && payment.status === "pending") && !["cancelled", "refunded", "draft"].includes(order.status);
  const statuses = [...ORDER_FLOW, "cancelled", "refunded"] as OrderStatus[];
  return <div className="space-y-6 mb-6">
    <Card title="Etapele comenzii">
      <p className="text-sm text-muted mb-4">{cash ? "Plată ramburs" : "Plată online"} · {order.paid_at ? `Încasată la ${new Date(order.paid_at).toLocaleString("ro-RO")}` : "Plată neîncasată"}</p>
      <div className="space-y-2">{statuses.map((step) => {
        const email = order.emails.find((item) => item.template_key === (step === "pending_payment" ? "placed" : step));
        const canChange = order.allowed_transitions.includes(step) && !["paid", "refunded"].includes(step);
        return <div key={step} className={`flex flex-wrap items-center justify-between gap-3 p-3 border rounded-sm ${order.status === step ? "border-olive bg-olive/5" : "border-ink/10"}`}>
          <div className="min-w-36"><span className="text-sm font-medium">{ORDER_STATUS_LABELS[step]}</span>{order.status === step && <span className="text-xs text-olive ml-2">Acum</span>}
            {email && <p className="text-xs text-muted mt-1">Email: {EMAIL_STATUS[email.status]}{email.sent_at && ` · ${new Date(email.sent_at).toLocaleString("ro-RO")}`}</p>}
          </div>
          {step !== "pending_payment" && <Checkbox label="Trimite email" checked={enabled(step)} onChange={(value) => setPreferences({ ...preferences, [step]: value })} />}
          {canChange && <Button variant={step === "cancelled" ? "danger" : "subtle"} disabled={busy || !templates || (step === "shipped" && !awb.trim())} onClick={() => run(`${root}/`, { ...shipping, status: step, expected_status: order.status, send_email: enabled(step) }, "patch")}>{ORDER_STATUS_LABELS[step]}</Button>}
        </div>;
      })}</div>
      <div className="flex flex-wrap gap-2 mt-4">
        {canRecordPayment && <Button disabled={busy || !templates} onClick={() => { if (window.confirm("Confirmi că ai încasat plata integrală?")) run(`${root}/record-payment/`, { confirmed: true, send_email: enabled("paid") }); }}>Înregistrează plata încasată</Button>}
        {order.allowed_transitions.includes("refunded") && order.payments.some((payment) => payment.status === "succeeded") && <Button variant="danger" disabled={busy || !templates} onClick={() => { if (window.confirm("Confirmi că rambursarea integrală a fost deja efectuată? Acest buton doar o înregistrează, nu transferă bani.")) run(`${root}/record-refund/`, { confirmed: true, send_email: enabled("refunded") }); }}>Înregistrează rambursarea efectuată</Button>}
      </div>
    </Card>
    <Card title="Expediere">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="AWB" hint="Se introduce manual. Obligatoriu la trecerea în Expediată."><TextInput maxLength={100} value={awb} onChange={(event) => setAwb(event.target.value)} /></Field>
        <Field label="Curier"><TextInput maxLength={100} value={courier} onChange={(event) => setCourier(event.target.value)} /></Field>
        <Field label="Link urmărire (opțional)" className="sm:col-span-2"><TextInput type="url" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} /></Field>
      </div>
      {order.shipped_at && <p className="text-xs text-muted mt-3">Expediată la {new Date(order.shipped_at).toLocaleString("ro-RO")}</p>}
      <div className="flex flex-wrap gap-2 mt-4">
        <Button variant="subtle" disabled={busy} onClick={() => run(`${root}/`, shipping, "patch")}>Salvează datele de expediere</Button>
        {["shipped", "completed"].includes(order.status) && <Button variant="subtle" disabled={busy || !order.awb || awb !== order.awb || courier !== order.courier || trackingUrl !== order.tracking_url} onClick={() => run(`${root}/send-shipping-email/`, { request_id: crypto.randomUUID(), resend: true })}>Retrimite emailul cu AWB-ul salvat</Button>}
      </div>
    </Card>
    {!order.invoices.length && <Card title="Emitere factură">
      <p className="text-sm text-muted">Verifică datele și previzualizarea înainte de emitere. Numărul este alocat doar la emitere. Trimiterea pe email se face separat.</p>
      {order.invoice_error && <p className="text-sm text-red-700 mt-3">{order.invoice_error}</p>}
      <div className="flex gap-2 mt-4"><Button variant="subtle" onClick={() => setPreview(true)}>Previzualizează</Button><Button disabled={busy || ["draft", "cancelled", "refunded"].includes(order.status)} onClick={() => run(`${root}/issue-invoice/`, {})}>Emite factura</Button></div>
    </Card>}
    {preview && <PdfPreview path={`${root}/invoice-preview/`} onClose={() => setPreview(false)} />}
  </div>;
}
