"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { crmLogout } from "@/lib/crm-api";

const PRIMARY_TABS = [
  { id: "dashboard", href: "/crm", label: "Dashboard", shape: "rounded" as const },
  { id: "orders", href: "/crm/orders", label: "Comenzi", shape: "circle" as const },
  { id: "products", href: "/crm/products", label: "Produse", shape: "square" as const },
  { id: "blog", href: "/crm/blog", label: "Blog", shape: "rounded" as const },
];

const MORE_LINKS = [
  { href: "/crm/categories", label: "Categorii" },
  { href: "/crm/media", label: "Media" },
  { href: "/crm/invoices", label: "Facturi" },
  { href: "/crm/settings", label: "Setări" },
  { href: "/crm/redirects", label: "Redirecturi" },
];

function tabForPath(pathname: string): string {
  if (pathname === "/crm") return "dashboard";
  if (pathname.startsWith("/crm/orders")) return "orders";
  if (pathname.startsWith("/crm/products")) return "products";
  if (pathname.startsWith("/crm/blog")) return "blog";
  if (
    pathname.startsWith("/crm/categories") ||
    pathname.startsWith("/crm/media") ||
    pathname.startsWith("/crm/invoices") ||
    pathname.startsWith("/crm/settings") ||
    pathname.startsWith("/crm/redirects")
  ) {
    return "more";
  }
  return "dashboard";
}

function TabIcon({
  shape,
  active,
}: {
  shape: "rounded" | "circle" | "square";
  active: boolean;
}) {
  const radius =
    shape === "circle" ? "9999px" : shape === "rounded" ? "3px" : "0";
  return (
    <div
      className="w-4 h-4 border-[1.6px] transition-colors"
      style={{
        borderRadius: radius,
        borderColor: active ? "var(--color-ink)" : "var(--color-stone)",
        background: active ? "var(--color-ink)" : "transparent",
      }}
    />
  );
}

export function MobileHeader({ userName }: { userName: string }) {
  const initial = userName.trim().charAt(0).toUpperCase() || "A";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3.5 border-b border-ink/10 bg-paper/95 backdrop-blur-sm shrink-0">
      <Link href="/crm" className="flex items-center gap-2 min-w-0">
        <Image
          src="/logo-mark.svg"
          alt=""
          width={24}
          height={24}
          className="h-6 w-auto shrink-0"
        />
        <span className="text-[13px] tracking-[0.06em] font-semibold text-ink truncate">
          AVE LETTER <span className="text-gold">CRM</span>
        </span>
      </Link>
      <div
        className="w-7 h-7 rounded-full bg-gold/15 flex items-center justify-center text-[12px] text-soft font-semibold shrink-0"
        aria-hidden
      >
        {initial}
      </div>
    </header>
  );
}

export function MobileTabBar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const activeTab = tabForPath(pathname);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const inactive = "#b3ab9c";
  const activeColor = "var(--color-ink)";

  return (
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-40 flex border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Navigare principală"
      >
        {PRIMARY_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 px-0.5 min-h-[52px]"
            >
              <TabIcon shape={tab.shape} active={active} />
              <span
                className="text-[10px] font-semibold tracking-wide"
                style={{ color: active ? activeColor : inactive }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center gap-1 py-2.5 px-0.5 min-h-[52px] cursor-pointer"
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
        >
          <TabIcon shape="circle" active={activeTab === "more"} />
          <span
            className="text-[10px] font-semibold tracking-wide"
            style={{ color: activeTab === "more" ? activeColor : inactive }}
          >
            Mai mult
          </span>
        </button>
      </nav>

      {moreOpen && (
        <MoreSheet userName={userName} onClose={() => setMoreOpen(false)} />
      )}
    </>
  );
}

function MoreSheet({
  userName,
  onClose,
}: {
  userName: string;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();

  const isActive = (href: string) =>
    href === "/crm" ? pathname === "/crm" : pathname.startsWith(href);

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-ink/30 cursor-pointer"
        aria-label="Închide meniul"
        onClick={onClose}
      />
      <div className="absolute bottom-0 inset-x-0 bg-white border-t border-ink/10 rounded-t-md pb-[env(safe-area-inset-bottom)] animate-[slideUp_0.2s_ease]">
        <div className="px-5 pt-4 pb-2 border-b border-ink/8">
          <p className="text-[11px] tracking-[0.1em] uppercase text-muted font-semibold">
            Mai mult
          </p>
          {userName && (
            <p className="text-[13px] text-soft mt-1 truncate">{userName}</p>
          )}
        </div>
        <ul className="py-2">
          {MORE_LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                className={`block px-5 py-3.5 text-[15px] transition-colors ${
                  isActive(item.href)
                    ? "text-ink font-medium bg-gold/10"
                    : "text-body hover:bg-ink/5"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="border-t border-ink/8 px-5 py-4 flex items-center gap-4 text-[13px]">
          <Link href="/" target="_blank" className="avelink text-olive" onClick={onClose}>
            Vezi site →
          </Link>
          <button
            type="button"
            className="text-muted hover:text-ink cursor-pointer"
            onClick={async () => {
              onClose();
              await crmLogout();
              qc.clear();
              router.push("/crm/login");
            }}
          >
            Ieșire
          </button>
        </div>
      </div>
    </div>
  );
}
