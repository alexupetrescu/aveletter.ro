"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart";

const linkBase =
  "avelink text-[12.5px] tracking-[1.5px]";

function NavLink({
  href,
  children,
  active,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${linkBase} ${active ? "font-medium text-ink" : "text-muted"} ${className}`}
    >
      {children}
    </Link>
  );
}

export default function Nav() {
  const { count } = useCart();
  const pathname = usePathname();

  return (
    <div className="border-b border-ink/8 bg-[rgba(248,246,240,0.92)] backdrop-blur-[8px]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-[18px] lg:px-12">
        <div className="flex flex-1 items-center gap-5 lg:gap-9">
          <NavLink href="/" active={pathname === "/"}>
            ACASĂ
          </NavLink>
          <NavLink href="/shop" active={pathname.startsWith("/shop")}>
            PRODUSE
          </NavLink>
          <NavLink href="/#servicii" className="hidden md:inline">
            SERVICII
          </NavLink>
        </div>

        <Link href="/" className="avelink shrink-0 px-6 text-center">
          <Image
            src="/logo-mark.svg"
            alt="Ave Letter Studio — Cadouri personalizate prin caligrafie"
            width={120}
            height={40}
            className="mx-auto block h-10 w-auto"
            priority
          />
        </Link>

        <div className="flex flex-1 items-center justify-end gap-5 lg:gap-9">
          <NavLink href="/#contact" className="hidden md:inline">
            CONTACT
          </NavLink>
          <NavLink href="/#despre" className="hidden whitespace-nowrap lg:inline">
            DESPRE MINE
          </NavLink>
          <NavLink href="/blog" active={pathname.startsWith("/blog")}>
            BLOG
          </NavLink>
          <div className="ml-3 flex items-center gap-[18px]">
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1A1A1A"
              strokeWidth="1.4"
              aria-hidden
            >
              <path d="M12 21s-7.5-4.6-10-9.2C.4 8.4 2 4.5 6 4.2c2.3-.2 3.9 1 6 3 2.1-2 3.7-3.2 6-3 4 .3 5.6 4.2 4 7.6C19.5 16.4 12 21 12 21z" />
            </svg>
            <Link href="/cart" className="avelink relative" aria-label="Coș">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1A1A1A"
                strokeWidth="1.4"
                aria-hidden
              >
                <path d="M6 8h12l-1 12H7L6 8z" />
                <path d="M9 8V6a3 3 0 016 0v2" />
              </svg>
              <div className="absolute -top-2 -right-[9px] flex size-[15px] items-center justify-center rounded-full bg-olive text-[9px] text-paper">
                {count}
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
