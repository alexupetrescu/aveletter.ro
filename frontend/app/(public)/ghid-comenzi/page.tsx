import Link from "next/link";
import { getSiteConfig } from "@/lib/api";
import { resolveContact } from "@/lib/contact";
import { formatBani } from "@/lib/money";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export async function generateMetadata() {
  return pageMetadata({ title: "Cadouri personalizate: comenzi, prețuri și livrare", path: "/ghid-comenzi",
    description: "Cum comanzi un cadou caligrafiat: alegerea textului, personalizare, prețuri, timp de producție și livrare în România." });
}

export default async function OrderingGuide() {
  const config = await getSiteConfig();
  const contact = resolveContact(config);
  return <article className="mx-auto max-w-[900px] px-6 py-20 lg:px-12">
    <JsonLd data={breadcrumbs([{ name: "Acasă", path: "/" }, { name: "Personalizare și livrare", path: "/ghid-comenzi" }], config)} />
    <p className="mb-3 text-sm tracking-widest text-olive">GHID DE COMANDĂ</p>
    <h1 className="mb-8 font-serif text-[38px] leading-tight lg:text-[48px]">Cum comanzi un cadou personalizat prin caligrafie</h1>
    <p className="mb-10 leading-8 text-muted">La Ave Letter Studio, mesajele sunt scrise de mână. Alege un produs, verifică opțiunile lui și pregătește textul pe care vrei să îl transformi într-un cadou.</p>
    <div className="posttext [&_h2]:mb-4 [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-[27px] [&_a]:text-olive [&_a]:underline [&_a]:underline-offset-4">
      <h2>Cum aleg produsul potrivit?</h2>
      <p>Pentru un nume, o inițială sau un mesaj scurt, explorează <Link href="/shop/categorie/globuri-de-craciun">globurile și ornamentele personalizate</Link>. Pentru un mesaj mai lung, vezi <Link href="/shop/categorie/scrisori">scrisorile</Link> și <Link href="/shop/categorie/tablouri">tablourile caligrafice</Link>. Pentru un cititor, poți alege un <Link href="/shop/categorie/semne-de-carte">semn de carte personalizat</Link>.</p>
      <h2>Ce text pot trimite pentru personalizare?</h2>
      <p>Fiecare produs are propriile câmpuri de personalizare. Verifică numărul maxim de caractere sau cuvinte, apoi scrie mesajul exact cum dorești să apară, inclusiv numele și diacriticele. Materialele, dimensiunile și opțiunile disponibile sunt descrise pe pagina produsului.</p>
      <h2>Cum se calculează prețul?</h2>
      <p>Prețul depinde de produs și de opțiunile selectate. La produsele cu text variabil, acesta poate depinde și de lungimea mesajului. Completează personalizarea pentru a vedea prețul calculat, apoi verifică totalul din coș înainte de a trimite comanda.</p>
      <h2>Cât durează realizarea?</h2>
      <p>Timpul de producție este afișat pe pagina fiecărui produs, în zile lucrătoare. Producția și transportul sunt etape diferite. Dacă ai nevoie de cadou până la o anumită dată, <Link href="/contact">contactează atelierul</Link> înainte de a comanda pentru a verifica dacă termenul poate fi respectat.</p>
      <h2>Unde se livrează și cât costă transportul?</h2>
      <p>Comenzile prin site se livrează în România. {config.delivery_fee_amount === 0 ? "Livrarea este gratuită." : `Taxa de livrare este ${formatBani(config.delivery_fee_amount)}.`} {config.delivery_fee_amount > 0 && config.free_shipping_threshold_amount != null && `Livrarea este gratuită pentru comenzi de minimum ${formatBani(config.free_shipping_threshold_amount)}.`} Costul aplicabil apare și la finalizarea comenzii.</p>
      <p>Pentru o livrare în afara României, scrie la <a href={`mailto:${contact.email}`}>{contact.email}</a> pentru a discuta posibilitățile.</p>
      <h2>Ce ambalaj este inclus?</h2>
      <p>Verifică descrierea produsului pentru a vedea ce include prețul: produsul personalizat, accesoriile și, acolo unde este menționat, ambalajul de cadou. Păstrează și respectă instrucțiunile de îngrijire, în special pentru obiectele fragile.</p>
      <h2>Am o idee specială sau o întrebare despre comandă</h2>
      <p>Pentru un proiect care nu se potrivește opțiunilor de pe site, o modificare sau o întrebare despre o comandă existentă, <Link href="/contact">contactează atelierul</Link>. Include produsul, mesajul dorit și data la care ai nevoie de cadou, dacă este cazul.</p>
    </div>
    <Link href="/shop" className="avelink mt-10 inline-block border-b border-ink text-sm tracking-widest">DESCOPERĂ CADOURILE →</Link>
  </article>;
}
