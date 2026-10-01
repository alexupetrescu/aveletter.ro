"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { crm, type CrmInvoice } from "@/lib/crm-api";
import { Button, useToast } from "./ui";

export function PdfPreview({ path, onClose }: { path: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    crm.pdf(path).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((err) => { if (!disposed) setError(err.message); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  return <div className="fixed inset-0 z-50 bg-ink/50 p-3 md:p-8" role="dialog" aria-modal="true" aria-label="Previzualizare factură">
    <div className="h-full bg-paper rounded-sm flex flex-col max-w-5xl mx-auto">
      <div className="flex justify-between items-center gap-3 p-4 border-b border-ink/10">
        <strong>Factură PDF</strong>
        <div className="flex gap-4 items-center">
          {url && <a href={url} download="factura.pdf" className="avelink text-sm text-olive">Descarcă PDF</a>}
          <Button variant="subtle" onClick={onClose}>Închide</Button>
        </div>
      </div>
      {error ? <p className="p-6 text-red-700">{error}</p> : url ? <iframe title="Factură PDF" src={url} className="w-full flex-1 border-0" /> : <p className="p-6">Se generează previzualizarea…</p>}
    </div>
  </div>;
}

export default function InvoiceActions({ invoice }: { invoice: CrmInvoice }) {
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const hasEmail = invoice.emails.some((email) => email.status !== "skipped");
  const pending = invoice.emails.some((email) => ["pending", "sending"].includes(email.status));
  async function send() {
    if (hasEmail && !window.confirm("Retrimiți factura pe email clientului?")) return;
    setBusy(true);
    requestId.current ??= crypto.randomUUID();
    try {
      await crm.post(`/invoices/${invoice.id}/send/`, { request_id: requestId.current, resend: hasEmail });
      requestId.current = null;
      await Promise.all(["orders", "invoices"].map((resource) => qc.invalidateQueries({ queryKey: ["crm", resource] })));
      toast("Factura a fost pusă în coada de trimitere.");
    } catch (error) { toast(error instanceof Error ? error.message : "Eroare la trimitere.", "error"); }
    finally { setBusy(false); }
  }
  return <>
    <div className="flex flex-wrap gap-2 mt-3">
      <Button variant="subtle" onClick={() => setPreview(true)}>Vezi / descarcă PDF</Button>
      <Button disabled={busy || pending} onClick={send}>{pending ? "Email în așteptare" : hasEmail ? "Retrimite factura" : "Trimite factura pe email"}</Button>
    </div>
    {preview && <PdfPreview path={`/invoices/${invoice.id}/pdf/`} onClose={() => setPreview(false)} />}
  </>;
}
