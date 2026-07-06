import type { Metadata } from "next";
import Link from "next/link";

import { getSiteConfig } from "@/lib/api";
import { resolveContact } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contact — Ave Letter Studio",
  description:
    "Scrie-ne pentru comenzi personalizate, întrebări despre produse sau colaborări. Răspundem cu drag.",
};

export default async function ContactPage() {
  let contact = resolveContact(null);
  try {
    contact = resolveContact(await getSiteConfig());
  } catch {
    // use defaults
  }

  return (
    <div>
      <div className="mx-auto max-w-[1440px] px-6 pt-[84px] pb-10 text-center lg:px-12">
        <div className="mb-2 font-script text-[28px] text-olive">să păstrăm legătura</div>
        <h1 className="mb-[18px] font-serif text-[40px] font-medium lg:text-[52px]">Contact</h1>
        <p className="mx-auto max-w-[520px] text-[14.5px] leading-[1.8] text-muted">
          Pentru comenzi personalizate, întrebări despre produse sau colaborări — scrie-ne sau
          sună-ne. Răspund cu drag.
        </p>
      </div>

      <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-12 px-6 pb-24 lg:grid-cols-2 lg:gap-16 lg:px-12">
        <div>
          <div className="mb-[18px] text-[11px] tracking-[2px] text-olive">DATE DE CONTACT</div>
          <div className="flex flex-col gap-5 text-[15px] leading-[1.8] text-body">
            <p>
              <span className="mb-1 block text-[11px] tracking-[1.5px] text-muted uppercase">
                Email
              </span>
              <a href={`mailto:${contact.email}`} className="avelink border-b border-olive">
                {contact.email}
              </a>
            </p>
            <p>
              <span className="mb-1 block text-[11px] tracking-[1.5px] text-muted uppercase">
                Telefon
              </span>
              <a href={`tel:${contact.phone}`} className="avelink border-b border-olive">
                {contact.phoneDisplay}
              </a>
            </p>
            <p>
              <span className="mb-1 block text-[11px] tracking-[1.5px] text-muted uppercase">
                Locație
              </span>
              {contact.location}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-[18px] text-[11px] tracking-[2px] text-olive">SOCIAL</div>
          <div className="flex flex-col gap-4 text-[15px]">
            <a
              href={contact.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="avelink border-b border-ink/20 pb-1 text-body"
            >
              Instagram · {contact.instagramHandle}
            </a>
            <a
              href={contact.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="avelink border-b border-ink/20 pb-1 text-body"
            >
              Facebook · Ave Letter Studio
            </a>
          </div>

          <p className="mt-10 text-[13.5px] leading-[1.75] text-muted">
            Livrarea se face exclusiv pe teritoriul României. Pentru comenzi internaționale,
            scrie-ne la{" "}
            <a href={`mailto:${contact.email}`} className="border-b border-olive text-ink">
              {contact.email}
            </a>
            .
          </p>
        </div>
      </div>

      <div className="border-t border-ink/8 bg-paper px-6 py-16 text-center lg:px-12">
        <p className="mb-6 text-[14.5px] text-muted">Vrei să vezi ce putem crea împreună?</p>
        <Link
          href="/shop"
          className="avelink border-b border-ink pb-1 text-xs tracking-[2px]"
        >
          VEZI PRODUSELE →
        </Link>
      </div>
    </div>
  );
}
