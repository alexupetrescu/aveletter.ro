"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  crm,
  CrmSiteConfig,
  CrmTaxConfig,
  CrmVatRate,
} from "@/lib/crm-api";
import {
  useCrmCreate,
  useCrmList,
  useCrmSingleton,
  useCrmUpdate,
} from "@/lib/crm-hooks";
import {
  Button,
  Card,
  Checkbox,
  Field,
  MoneyInput,
  PageHeader,
  Select,
  TextArea,
  TextInput,
  useToast,
} from "@/components/crm/ui";

function SiteConfigPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: config } = useCrmSingleton<CrmSiteConfig>("site-config");
  const [draft, setDraft] = useState<Partial<CrmSiteConfig>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  const patch = (f: Partial<CrmSiteConfig>) => setDraft((d) => ({ ...d, ...f }));

  async function save() {
    setSaving(true);
    try {
      await crm.patch<CrmSiteConfig>("/site-config/", draft);
      qc.invalidateQueries({ queryKey: ["crm", "site-config"] });
      toast("Setările site-ului au fost salvate.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Eroare la salvare.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <Card title="Site"><p className="text-muted text-sm">Se încarcă…</p></Card>;

  return (
    <Card title="Site & contact">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nume site">
            <TextInput
              value={draft.site_name ?? ""}
              onChange={(e) => patch({ site_name: e.target.value })}
            />
          </Field>
          <Field label="Domeniu">
            <TextInput
              value={draft.domain ?? ""}
              onChange={(e) => patch({ domain: e.target.value })}
            />
          </Field>
          <Field label="Email de contact">
            <TextInput
              type="email"
              value={draft.contact_email ?? ""}
              onChange={(e) => patch({ contact_email: e.target.value })}
            />
          </Field>
          <Field label="Telefon">
            <TextInput
              value={draft.contact_phone ?? ""}
              onChange={(e) => patch({ contact_phone: e.target.value })}
            />
          </Field>
          <Field label="Instagram">
            <TextInput
              value={draft.instagram_url ?? ""}
              onChange={(e) => patch({ instagram_url: e.target.value })}
            />
          </Field>
          <Field label="Facebook">
            <TextInput
              value={draft.facebook_url ?? ""}
              onChange={(e) => patch({ facebook_url: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Titlu SEO implicit">
            <TextInput
              maxLength={70}
              value={draft.default_seo_title ?? ""}
              onChange={(e) => patch({ default_seo_title: e.target.value })}
            />
          </Field>
          <Field label="Prag livrare gratuită" hint="Gol = fără livrare gratuită.">
            <MoneyInput
              value={draft.free_shipping_threshold_amount ?? null}
              onChange={(v) => patch({ free_shipping_threshold_amount: v })}
              allowEmpty
            />
          </Field>
        </div>
        <Field label="Descriere SEO implicită">
          <TextArea
            rows={2}
            maxLength={160}
            value={draft.default_seo_description ?? ""}
            onChange={(e) => patch({ default_seo_description: e.target.value })}
          />
        </Field>
        <div className="space-y-3">
          <Checkbox
            label="Banner de anunț activ"
            checked={draft.announcement_enabled ?? false}
            onChange={(v) => patch({ announcement_enabled: v })}
          />
          {draft.announcement_enabled && (
            <TextInput
              placeholder="Textul anunțului…"
              value={draft.announcement_text ?? ""}
              onChange={(e) => patch({ announcement_text: e.target.value })}
            />
          )}
          <Checkbox
            label="Mod mentenanță"
            hint="Ascunde site-ul public."
            checked={draft.maintenance_mode ?? false}
            onChange={(v) => patch({ maintenance_mode: v })}
          />
        </div>
        <Button disabled={saving} onClick={save}>
          {saving ? "Se salvează…" : "Salvează setările site-ului"}
        </Button>
      </div>
    </Card>
  );
}

function TaxPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: config } = useCrmSingleton<CrmTaxConfig>("tax-config");
  const { data: rates } = useCrmList<CrmVatRate[]>("vat-rates");
  const [draft, setDraft] = useState<Partial<CrmTaxConfig>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  const patch = (f: Partial<CrmTaxConfig>) => setDraft((d) => ({ ...d, ...f }));

  async function save() {
    setSaving(true);
    try {
      await crm.patch<CrmTaxConfig>("/tax-config/", draft);
      qc.invalidateQueries({ queryKey: ["crm", "tax-config"] });
      toast("Configurația fiscală a fost salvată.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Eroare la salvare.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <Card title="TVA & identitate fiscală">
        <p className="text-muted text-sm">Se încarcă…</p>
      </Card>
    );
  }

  return (
    <Card title="TVA & identitate fiscală">
      <div className="space-y-4">
        <div
          className={`border rounded-sm px-4 py-3 ${
            draft.vat_enabled
              ? "border-olive/40 bg-olive/5"
              : "border-gold/40 bg-gold/5"
          }`}
        >
          <Checkbox
            label={draft.vat_enabled ? "TVA ACTIVAT" : "TVA dezactivat (neplătitor de TVA)"}
            hint="Comutatorul fiscal. Comenzile vechi își păstrează propriul regim de TVA — nu se recalculează nimic retroactiv."
            checked={draft.vat_enabled ?? false}
            onChange={(v) => patch({ vat_enabled: v })}
          />
        </div>
        {draft.vat_enabled && (
          <Checkbox
            label="Prețurile includ TVA"
            hint="Bifat: prețul afișat e brut, TVA se extrage. Nebifat: TVA se adaugă peste."
            checked={draft.prices_include_vat ?? true}
            onChange={(v) => patch({ prices_include_vat: v })}
          />
        )}
        <Field label="Cota TVA implicită">
          <Select
            value={draft.default_vat_rate ?? ""}
            onChange={(e) => patch({ default_vat_rate: Number(e.target.value) })}
          >
            {rates?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Denumire legală">
            <TextInput
              value={draft.legal_name ?? ""}
              onChange={(e) => patch({ legal_name: e.target.value })}
            />
          </Field>
          <Field label="CUI / CIF">
            <TextInput
              value={draft.cui ?? ""}
              onChange={(e) => patch({ cui: e.target.value })}
            />
          </Field>
          <Field label="Nr. Reg. Com.">
            <TextInput
              value={draft.reg_com ?? ""}
              onChange={(e) => patch({ reg_com: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Adresă fiscală">
          <TextArea
            rows={2}
            value={draft.fiscal_address ?? ""}
            onChange={(e) => patch({ fiscal_address: e.target.value })}
          />
        </Field>
        <Button disabled={saving} onClick={save}>
          {saving ? "Se salvează…" : "Salvează configurația fiscală"}
        </Button>
      </div>
    </Card>
  );
}

function VatRatesPanel() {
  const toast = useToast();
  const { data: rates, isLoading } = useCrmList<CrmVatRate[]>("vat-rates");
  const create = useCrmCreate<CrmVatRate>("vat-rates");
  const update = useCrmUpdate<CrmVatRate>("vat-rates");

  const [name, setName] = useState("");
  const [percent, setPercent] = useState("19");
  const [exempt, setExempt] = useState(false);
  const [mention, setMention] = useState("");

  return (
    <Card title="Cote TVA">
      {isLoading ? (
        <p className="text-muted text-sm">Se încarcă…</p>
      ) : (
        <ul className="space-y-2 mb-5">
          {rates?.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 border border-ink/10 rounded-sm px-3 py-2"
            >
              <span className="text-sm">
                <strong>{r.name}</strong>{" "}
                <span className="text-muted">
                  {r.is_exempt ? "· scutit" : `· ${r.rate_bp / 100}%`}
                  {r.legal_mention && ` · „${r.legal_mention}"`}
                </span>
              </span>
              <Checkbox
                label="Activă"
                checked={r.is_active}
                onChange={(v) =>
                  update.mutate(
                    { id: r.id, body: { is_active: v } },
                    {
                      onSuccess: () => toast("Cota a fost actualizată."),
                      onError: (err) => toast(err.message, "error"),
                    },
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 border-t border-ink/10 pt-4">
        <p className="text-[12px] tracking-[0.14em] uppercase text-muted">Cotă nouă</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nume">
            <TextInput
              placeholder="Standard 19%"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Procent">
            <TextInput
              type="number"
              min={0}
              step="0.01"
              value={percent}
              disabled={exempt}
              onChange={(e) => setPercent(e.target.value)}
            />
          </Field>
        </div>
        <Checkbox
          label="Scutit (neplătitor)"
          checked={exempt}
          onChange={setExempt}
        />
        <Field label="Mențiune legală" hint="Tipărită pe factură.">
          <TextInput
            placeholder="Neplătitor de TVA"
            value={mention}
            onChange={(e) => setMention(e.target.value)}
          />
        </Field>
        <Button
          disabled={!name || create.isPending}
          onClick={() =>
            create.mutate(
              {
                name,
                rate_bp: exempt ? 0 : Math.round(parseFloat(percent || "0") * 100),
                is_exempt: exempt,
                legal_mention: mention,
                is_active: true,
              },
              {
                onSuccess: () => {
                  toast("Cota a fost creată.");
                  setName("");
                  setMention("");
                },
                onError: (err) => toast(err.message, "error"),
              },
            )
          }
        >
          Adaugă cotă
        </Button>
      </div>
    </Card>
  );
}

export default function CrmSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Setări"
        subtitle="Configurația site-ului și regimul fiscal"
      />
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <SiteConfigPanel />
        <div className="space-y-6">
          <TaxPanel />
          <VatRatesPanel />
        </div>
      </div>
    </div>
  );
}
