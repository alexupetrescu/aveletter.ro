"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { crm, type CrmEmail, type CrmEmailTemplate, type CrmNotificationConfig, type Paginated } from "@/lib/crm-api";
import { useCrmList, useCrmSingleton } from "@/lib/crm-hooks";
import { Button, Card, Checkbox, Field, TextArea, TextInput, useToast } from "./ui";
import EmailHistory from "./EmailHistory";

function NotificationForm({ config }: { config: CrmNotificationConfig }) {
  const [draft, setDraft] = useState(config);
  const [recipients, setRecipients] = useState(config.order_recipients.join("\n"));
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  async function save() {
    setBusy(true);
    try {
      const saved = await crm.patch<CrmNotificationConfig>("/notification-config/", {
        ...draft, order_recipients: recipients.split(/[\s,;]+/).filter(Boolean),
      });
      qc.setQueryData(["crm", "notification-config"], saved);
      toast("Setările de notificare au fost salvate.");
    } catch (error) { toast(error instanceof Error ? error.message : "Eroare la salvare.", "error"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <Checkbox label="Notifică atelierul când se plasează o comandă" checked={draft.staff_notifications_enabled} onChange={(value) => setDraft({ ...draft, staff_notifications_enabled: value })} />
    <Field label="Destinatari comenzi noi" hint="Un email pe rând. Poți introduce mai multe adrese.">
      <TextArea rows={3} value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="comenzi@exemplu.ro" />
    </Field>
    <Field label="Nume expeditor"><TextInput value={draft.sender_name} onChange={(event) => setDraft({ ...draft, sender_name: event.target.value })} /></Field>
    <Field label="Adresă pentru răspunsuri (opțional)"><TextInput type="email" value={draft.reply_to} onChange={(event) => setDraft({ ...draft, reply_to: event.target.value })} /></Field>
    <Button disabled={busy} onClick={save}>Salvează notificările</Button>
  </div>;
}

function TemplateEditor({ template, placeholders }: { template: CrmEmailTemplate; placeholders: string[] }) {
  const [draft, setDraft] = useState(template);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [testEmail, setTestEmail] = useState<CrmEmail | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  async function action(kind: "save" | "preview" | "test") {
    setBusy(true);
    try {
      const body = { enabled: draft.enabled, subject: draft.subject, body: draft.body };
      if (kind === "save") {
        await crm.patch(`/email-templates/${template.id}/`, body);
        await qc.invalidateQueries({ queryKey: ["crm", "email-templates"] });
        toast("Șablon salvat.");
      } else if (kind === "preview") {
        setPreview(await crm.post(`/email-templates/${template.id}/preview/`, body));
      } else {
        setTestEmail(await crm.post(`/email-templates/${template.id}/test/`, { ...body, recipient }));
        await qc.invalidateQueries({ queryKey: ["crm", "email-log"] });
        toast("Emailul de test a fost pus în coadă.");
      }
    } catch (error) { toast(error instanceof Error ? error.message : "Operațiunea a eșuat.", "error"); }
    finally { setBusy(false); }
  }
  return <details className="border border-ink/10 rounded-sm p-4">
    <summary className="cursor-pointer font-medium text-sm">{template.name} <span className="text-muted font-normal">· {template.enabled ? "activ" : "dezactivat"}</span></summary>
    <div className="space-y-4 mt-4">
      <Checkbox label="Trimite implicit email pentru această etapă" checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
      <Field label="Subiect"><TextInput maxLength={255} value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></Field>
      <Field label="Mesaj" hint="Textul este formatat automat în email. Folosește variabilele de mai jos."><TextArea rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></Field>
      <div className="flex flex-wrap gap-1.5">{placeholders.map((key) => <button type="button" key={key} className="text-xs px-2 py-1 border border-ink/10 rounded-sm text-olive cursor-pointer" onClick={() => setDraft({ ...draft, body: `${draft.body}{{${key}}}` })}>{`{{${key}}}`}</button>)}</div>
      <div className="flex gap-2"><Button disabled={busy} onClick={() => action("save")}>Salvează șablonul</Button><Button variant="subtle" disabled={busy} onClick={() => action("preview")}>Previzualizează</Button></div>
      {preview && <div><p className="text-sm font-medium mb-2">{preview.subject}</p><iframe title={`Previzualizare ${template.name}`} sandbox="" srcDoc={preview.html} className="w-full h-80 border border-ink/10" /></div>}
      <div className="flex flex-wrap items-end gap-2"><Field label="Destinatar email de test" className="flex-1"><TextInput type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="email@exemplu.ro" /></Field><Button variant="subtle" disabled={busy || !recipient} onClick={() => action("test")}>Trimite test</Button></div>
      {testEmail && <p className="text-xs text-muted">Test #{testEmail.id} programat către {testEmail.recipient}. Starea actuală este afișată în istoricul de mai jos.</p>}
    </div>
  </details>;
}

export default function CommunicationSettings() {
  const config = useCrmSingleton<CrmNotificationConfig>("notification-config");
  const templates = useCrmList<CrmEmailTemplate[]>("email-templates");
  const placeholders = useCrmSingleton<string[]>("email-templates/placeholders");
  const log = useCrmList<Paginated<CrmEmail>>("email-log");
  return <div className="space-y-6">
    <Card title="Notificări comenzi">
      {config.data ? <NotificationForm key={JSON.stringify(config.data)} config={config.data} /> : <p className="text-sm text-muted">{config.isError ? "Setările nu au putut fi încărcate." : "Se încarcă…"}</p>}
    </Card>
    <Card title="Șabloane email">
      <p className="text-sm text-muted mb-4">Fiecare etapă are propriul mesaj. La schimbarea statusului poți alege dacă se trimite emailul pentru comanda respectivă.</p>
      <div className="space-y-3">{templates.data?.map((template) => <TemplateEditor key={`${template.id}:${template.updated_at}`} template={template} placeholders={placeholders.data ?? []} />)}</div>
      {templates.isError && <p className="text-red-700 text-sm">Șabloanele nu au putut fi încărcate.</p>}
    </Card>
    <Card title="Emailuri recente">
      <Button variant="subtle" className="mb-3" onClick={() => log.refetch()}>Actualizează istoricul</Button>
      <EmailHistory emails={log.data?.results ?? []} />
    </Card>
  </div>;
}
