"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { crm, type CrmInvoiceSeries, type CrmTaxConfig } from "@/lib/crm-api";
import { useCrmList, useCrmSingleton } from "@/lib/crm-hooks";
import { Button, Card, Field, Select, TextArea, TextInput, useToast } from "./ui";
import MediaPicker, { MediaThumb } from "./MediaPicker";

function InvoiceSettingsForm({ config, series }: { config: CrmTaxConfig; series: CrmInvoiceSeries[] }) {
  const [draft, setDraft] = useState(config);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  async function save() {
    setBusy(true);
    try {
      const { invoice_email, invoice_phone, iban, bank, swift, share_capital, invoice_logo, invoice_footer, payment_term_days, default_invoice_series } = draft;
      const saved = await crm.patch<CrmTaxConfig>("/tax-config/", { invoice_email, invoice_phone, iban, bank, swift, share_capital, invoice_logo, invoice_footer, payment_term_days, default_invoice_series });
      qc.setQueryData(["crm", "tax-config"], saved);
      toast("Setările facturilor au fost salvate.");
    } catch (error) { toast(error instanceof Error ? error.message : "Eroare la salvare.", "error"); }
    finally { setBusy(false); }
  }
  const fields = [
    ["invoice_email", "Email furnizor"], ["invoice_phone", "Telefon furnizor"],
    ["iban", "IBAN"], ["bank", "Bancă"], ["swift", "SWIFT"], ["share_capital", "Capital social"],
  ] as const;
  return <div className="space-y-4">
    <p className="text-sm text-muted">Denumirea, CIF-ul și adresa furnizorului se completează în „TVA & identitate fiscală”. Facturile emise își păstrează datele originale.</p>
    <div className="grid sm:grid-cols-2 gap-4">{fields.map(([key, label]) => <Field label={label} key={key}><TextInput value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></Field>)}</div>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Termen de plată (zile)"><TextInput type="number" min={0} max={3650} value={draft.payment_term_days} onChange={(event) => setDraft({ ...draft, payment_term_days: Number(event.target.value) })} /></Field>
      <Field label="Serie implicită"><Select value={draft.default_invoice_series ?? ""} onChange={(event) => setDraft({ ...draft, default_invoice_series: event.target.value ? Number(event.target.value) : null })}><option value="">Prima serie activă</option>{series.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</Select></Field>
    </div>
    <Field label="Logo factură" hint="PNG, JPEG sau WebP. Se păstrează o copie pe fiecare factură emisă."><div className="flex flex-wrap items-center gap-3"><MediaThumb asset={draft.invoice_logo_data} className="w-24 h-16 object-contain" /><Button variant="subtle" onClick={() => setPicker(true)}>Alege logo</Button>{draft.invoice_logo && <Button variant="subtle" onClick={() => setDraft({ ...draft, invoice_logo: null, invoice_logo_data: null })}>Elimină</Button>}</div></Field>
    <Field label="Mențiuni pe factură"><TextArea rows={4} value={draft.invoice_footer} onChange={(event) => setDraft({ ...draft, invoice_footer: event.target.value })} /></Field>
    <Button disabled={busy} onClick={save}>Salvează setările facturilor</Button>
    {picker && <MediaPicker onClose={() => setPicker(false)} onSelect={(asset) => { setPicker(false); setDraft({ ...draft, invoice_logo: asset.id, invoice_logo_data: asset.url ? { id: asset.id, url: asset.url, title: asset.title, alt_text: asset.alt_text } : null }); }} />}
  </div>;
}

export default function InvoiceSettings() {
  const { data, isError } = useCrmSingleton<CrmTaxConfig>("tax-config");
  const series = useCrmList<CrmInvoiceSeries[]>("invoice-series");
  return <Card title="Facturare"><>{data ? <InvoiceSettingsForm key={data.updated_at} config={data} series={series.data ?? []} /> : <p className="text-muted text-sm">{isError ? "Setările nu au putut fi încărcate." : "Se încarcă…"}</p>}</></Card>;
}
