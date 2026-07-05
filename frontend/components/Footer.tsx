import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <div id="contact" className="bg-ink px-6 pt-[90px] pb-10 text-footer-text lg:px-12">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-[60px] md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <Image
            src="/logo-mark.svg"
            alt="Ave Letter Studio"
            width={108}
            height={36}
            className="mb-2 h-9 w-auto brightness-[1.6] invert"
          />
          <div className="mb-5 text-[9px] tracking-[3px] text-gold">
            LETTER STUDIO
          </div>
          <p className="max-w-[280px] text-[13.5px] leading-[1.8] text-footer-muted">
            Cadouri și obiecte personalizate prin caligrafie, create manual
            într-un atelier din România.
          </p>
        </div>
        <div>
          <div className="mb-[18px] text-[11px] tracking-[2px] text-gold">
            NAVIGARE
          </div>
          <div className="flex flex-col gap-3 text-[13.5px]">
            <Link href="/" className="avelink text-footer-text">
              Acasă
            </Link>
            <Link href="/shop" className="avelink text-footer-text">
              Produse
            </Link>
            <Link href="/#servicii" className="avelink text-footer-text">
              Servicii
            </Link>
            <Link href="/blog" className="avelink text-footer-text">
              Blog
            </Link>
          </div>
        </div>
        <div>
          <div className="mb-[18px] text-[11px] tracking-[2px] text-gold">
            CONTACT
          </div>
          <div className="flex flex-col gap-3 text-[13.5px] text-footer-text">
            <span>contact@aveletter.ro</span>
            <span>+40 7xx xxx xxx</span>
            <span>Cluj-Napoca, România</span>
          </div>
        </div>
        <div>
          <div className="mb-[18px] text-[11px] tracking-[2px] text-gold">
            SOCIAL
          </div>
          <div className="flex flex-col gap-3 text-[13.5px]">
            <span className="text-footer-text">Instagram</span>
            <span className="text-footer-text">Facebook</span>
            <span className="text-footer-text">Pinterest</span>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-[70px] flex max-w-[1440px] flex-col justify-between gap-2 border-t border-white/10 pt-[26px] text-[11.5px] text-footer-dim sm:flex-row">
        <span>© 2026 Ave Letter Studio. Toate drepturile rezervate.</span>
        <span>Design &amp; caligrafie manuală, cu grijă.</span>
      </div>
    </div>
  );
}
