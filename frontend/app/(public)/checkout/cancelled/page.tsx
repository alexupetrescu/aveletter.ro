import Link from "next/link";

export default function CheckoutCancelledPage() {
  return (
    <div className="mx-auto max-w-[700px] px-6 pt-[84px] pb-32 text-center lg:px-12">
      <h1 className="mb-6 font-serif text-[40px] font-medium">
        Plata a fost anulată
      </h1>
      <p className="mb-8 text-[14.5px] leading-[1.8] text-muted">
        Nu s-a efectuat nicio plată. Poți relua oricând comanda — produsele te
        așteaptă în atelier.
      </p>
      <div className="flex justify-center gap-4">
        <Link
          href="/shop"
          className="avelink inline-block bg-ink px-[34px] py-4 text-xs tracking-[2px] text-paper"
        >
          ÎNAPOI LA PRODUSE
        </Link>
        <Link
          href="/cart"
          className="avelink inline-block border border-ink px-[34px] py-4 text-xs tracking-[2px]"
        >
          VEZI COȘUL
        </Link>
      </div>
    </div>
  );
}
