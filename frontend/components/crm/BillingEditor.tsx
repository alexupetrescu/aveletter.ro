"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { crm, type CrmAddress, type CrmOrderDetail } from "@/lib/crm-api";
import { Button, Checkbox, Field, TextInput, useToast } from "./ui";

export default function BillingEditor({ order }: { order: CrmOrderDetail }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<CrmAddress>>(order.billing_address ?? { is_company: false, country: "RO" });
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const fields = [["full_name", "Nume persoană de contact"], ["company_name", "Denumire firmă"], ["cui", "CIF / CUI"], ["reg_com", "Reg. com."], ["line1", "Adresă"], ["line2", "Adresă (continuare)"], ["city", "Localitate"], ["county", "Județ"], ["postal_code", "Cod poștal"], ["country", "Țară (cod: RO)"], ["phone", "Telefon"]] as const;
  if (order.invoices.length) return null;
  async function save() {
    setBusy(true);
    try {
      await crm.patch(`/orders/${order.order_number}/billing-address/`, draft);
      await qc.invalidateQueries({ queryKey: ["crm", "orders"] });
      setOpen(false);
      toast("Datele de facturare au fost salvate.");
    } catch (error) { toast(error instanceof Error ? error.message : "Eroare la salvare.", "error"); }
    finally { setBusy(false); }
  }
  return <div className="mt-4">
    <Button variant="subtle" onClick={() => setOpen(!open)}>{open ? "Închide editarea" : "Editează datele de facturare"}</Button>
    {open && <div className="space-y-3 mt-4">
      <Checkbox label="Persoană juridică" checked={draft.is_company ?? false} onChange={(value) => setDraft({ ...draft, is_company: value, ...(!value ? { company_name: "", cui: "", reg_com: "" } : {}) })} />
      {fields.filter(([key]) => draft.is_company || !["company_name", "cui", "reg_com"].includes(key)).map(([key, label]) => <Field key={key} label={label}><TextInput value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></Field>)}
      <Button disabled={busy} onClick={save}>Salvează facturarea</Button>
    </div>}
  </div>;
}
