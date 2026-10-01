"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { crm, type CrmEmail } from "@/lib/crm-api";
import { Button, useToast } from "./ui";

export const EMAIL_STATUS: Record<CrmEmail["status"], string> = {
  pending: "În așteptare", sending: "Se trimite", sent: "Trimis",
  failed: "Eșuat", skipped: "Omis", uncertain: "Rezultat necunoscut",
};

export default function EmailHistory({ emails }: { emails: CrmEmail[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const waiting = emails.some((email) => ["pending", "sending"].includes(email.status) || (email.status === "failed" && email.attempts < 5));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["crm", "orders"] });
      qc.invalidateQueries({ queryKey: ["crm", "invoices"] });
      qc.invalidateQueries({ queryKey: ["crm", "email-log"] });
    }, 5000);
    return () => clearInterval(timer);
  }, [waiting, qc]);

  async function act(email: CrmEmail, action: "retry" | "resend") {
    if (action === "resend" && !window.confirm(`Retrimiți mesajul către ${email.recipient}?${email.status === "uncertain" ? " Este posibil ca mesajul anterior să fi fost deja primit." : ""}`)) return;
    setBusy(email.id);
    try {
      await crm.post(`/email-log/${email.id}/${action}/`, { request_id: crypto.randomUUID(), resend: true });
      await Promise.all(["orders", "invoices", "email-log"].map((resource) => qc.invalidateQueries({ queryKey: ["crm", resource] })));
      toast("Emailul a fost pus în coada de trimitere.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Trimiterea nu a putut fi programată.", "error");
    } finally { setBusy(null); }
  }

  if (!emails.length) return <p className="text-sm text-muted">Nu există emailuri înregistrate. Emailurile vechi nu au istoric disponibil.</p>;
  return <div className="space-y-3">
    {emails.map((email) => <div key={email.id} className="border border-ink/10 rounded-sm p-3">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <strong>{email.subject}</strong>
        <span className={email.status === "sent" ? "text-olive" : ["failed", "uncertain"].includes(email.status) ? "text-red-700" : "text-muted"}>
          {email.status === "sent" && "✓ "}{EMAIL_STATUS[email.status]}
        </span>
      </div>
      <p className="text-xs text-muted mt-1">{email.recipient} · {new Date(email.sent_at ?? email.created_at).toLocaleString("ro-RO")} · încercări: {email.attempts}</p>
      {email.last_error && <p className="text-xs text-red-700 mt-2 break-words">{email.last_error}</p>}
      <details className="mt-2 text-xs"><summary className="cursor-pointer text-olive">Conținut email</summary><p className="whitespace-pre-wrap mt-2">{email.body}</p></details>
      {email.status === "failed" && <Button variant="subtle" className="mt-2" disabled={busy !== null} onClick={() => act(email, "retry")}>Reîncearcă</Button>}
      {["sent", "skipped", "uncertain"].includes(email.status) && <Button variant="subtle" className="mt-2" disabled={busy !== null} onClick={() => act(email, "resend")}>Retrimite</Button>}
    </div>)}
    <p className="text-xs text-muted">„Trimis” înseamnă acceptat de serverul de email.</p>
  </div>;
}
