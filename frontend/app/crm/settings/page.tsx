"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  crm,
  CrmHomeHero,
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
import MediaPicker, { MediaThumb } from "@/components/crm/MediaPicker";

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

function DeliveryConfigPanel() {
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
      await crm.patch<CrmSiteConfig>("/site-config/", {
        delivery_fee_amount: draft.delivery_fee_amount,
        free_shipping_threshold_amount: draft.free_shipping_threshold_amount,
      });
      qc.invalidateQueries({ queryKey: ["crm", "site-config"] });
      toast("Setările de livrare au fost salvate.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Eroare la salvare.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <Card title="Livrare">
        <p className="text-muted text-sm">Se încarcă…</p>
      </Card>
    );
  }

  const fee = draft.delivery_fee_amount ?? 0;
  const threshold = draft.free_shipping_threshold_amount;

  return (
    <Card title="Livrare">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Exemplu: taxă 25 lei, dar 0 lei dacă subtotalul produselor depășește
          300 lei (sau suma setată mai jos).
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Taxă livrare"
            hint="Se aplică la finalizarea comenzii. 0 = fără taxă."
          >
            <MoneyInput
              value={fee}
              onChange={(v) => patch({ delivery_fee_amount: v ?? 0 })}
            />
          </Field>
          <Field
            label="Prag livrare gratuită (subtotal produse)"
            hint="Gol = taxa se aplică mereu (dacă e setată). La sau peste prag → 0 lei livrare."
          >
            <MoneyInput
              value={threshold ?? null}
              onChange={(v) => patch({ free_shipping_threshold_amount: v })}
              allowEmpty
            />
          </Field>
        </div>
        {fee > 0 && threshold != null && threshold > 0 && (
          <p className="rounded-sm border border-ink/10 bg-ink/5 px-3 py-2 text-sm text-body">
            Clienții văd: Livrare gratuită pentru comenzi peste{" "}
            {(threshold / 100).toFixed(0)} lei.
          </p>
        )}
        <Button disabled={saving} onClick={save}>
          {saving ? "Se salvează…" : "Salvează livrarea"}
        </Button>
      </div>
    </Card>
  );
}

function HomeHeroPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: hero } = useCrmSingleton<CrmHomeHero>("home-hero");
  const [draft, setDraft] = useState<Partial<CrmHomeHero>>({});
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bgPreview, setBgPreview] = useState<{ url: string; alt_text?: string } | null>(null);

  useEffect(() => {
    if (hero) setDraft(hero);
  }, [hero]);

  const patch = (f: Partial<CrmHomeHero>) => setDraft((d) => ({ ...d, ...f }));

  async function save() {
    setSaving(true);
    try {
      await crm.patch<CrmHomeHero>("/home-hero/", draft);
      qc.invalidateQueries({ queryKey: ["crm", "home-hero"] });
      toast("Hero-ul paginii principale a fost salvat.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Eroare la salvare.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!hero) {
    return (
      <Card title="Hero pagină principală">
        <p className="text-muted text-sm">Se încarcă…</p>
      </Card>
    );
  }

  return (
    <Card title="Hero pagină principală">
      <div className="space-y-4">
        <Field label="Imagine fundal">
          <div className="flex items-center gap-3">
            <MediaThumb
              asset={bgPreview}
              className="w-24 h-16 rounded-sm border border-ink/10"
            />
            <Button variant="subtle" onClick={() => setPickerOpen(true)}>
              {draft.background_image ? "Schimbă imaginea" : "Alege imagine"}
            </Button>
            {draft.background_image && (
              <Button
                variant="subtle"
                onClick={() => {
                  patch({ background_image: null });
                  setBgPreview(null);
                }}
              >
                Elimină
              </Button>
            )}
          </div>
        </Field>
        <Field label="Tagline (script)">
          <TextInput
            value={draft.tagline ?? ""}
            onChange={(e) => patch({ tagline: e.target.value })}
          />
        </Field>
        <Field label="Titlu principal" hint="Folosește Enter pentru linie nouă.">
          <TextArea
            rows={2}
            value={draft.title ?? ""}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </Field>
        <Field label="Text scurt">
          <TextArea
            rows={3}
            value={draft.copy ?? ""}
            onChange={(e) => patch({ copy: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Buton principal — text">
            <TextInput
              value={draft.primary_button_label ?? ""}
              onChange={(e) => patch({ primary_button_label: e.target.value })}
            />
          </Field>
          <Field label="Buton principal — link">
            <TextInput
              value={draft.primary_button_url ?? ""}
              onChange={(e) => patch({ primary_button_url: e.target.value })}
            />
          </Field>
          <Field label="Buton secundar — text">
            <TextInput
              value={draft.secondary_button_label ?? ""}
              onChange={(e) => patch({ secondary_button_label: e.target.value })}
            />
          </Field>
          <Field label="Buton secundar — link">
            <TextInput
              value={draft.secondary_button_url ?? ""}
              onChange={(e) => patch({ secondary_button_url: e.target.value })}
            />
          </Field>
        </div>
        <Button disabled={saving} onClick={save}>
          {saving ? "Se salvează…" : "Salvează hero-ul"}
        </Button>
      </div>
      {pickerOpen && (
        <MediaPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(asset) => {
            setPickerOpen(false);
            patch({ background_image: asset.id });
            setBgPreview(
              asset.url
                ? { url: asset.url, alt_text: asset.alt_text }
                : null,
            );
          }}
        />
      )}
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
        <div className="space-y-6">
          <DeliveryConfigPanel />
          <SiteConfigPanel />
          <HomeHeroPanel />
        </div>
        <div className="space-y-6">
          <TaxPanel />
          <VatRatesPanel />
        </div>
      </div>
    </div>
  );
}
