"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { crmLogout, crmMe } from "@/lib/crm-api";
import { ToastProvider } from "@/components/crm/ui";
import { MobileHeader, MobileTabBar } from "@/components/crm/MobileNav";

const NAV = [
  { href: "/crm", label: "Dashboard" },
  { href: "/crm/orders", label: "Comenzi" },
  { href: "/crm/products", label: "Produse" },
  { href: "/crm/categories", label: "Categorii" },
  { href: "/crm/blog", label: "Blog" },
  { href: "/crm/media", label: "Media" },
  { href: "/crm/invoices", label: "Facturi" },
  { href: "/crm/settings", label: "Setări" },
];

function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();

  const isActive = (href: string) =>
    href === "/crm" ? pathname === "/crm" : pathname.startsWith(href);

  return (
    <aside className="hidden lg:flex w-56 shrink-0 border-r border-ink/10 bg-white/60 flex-col min-h-screen sticky top-0 max-h-screen">
      <Link href="/crm" className="flex items-center gap-2.5 px-5 py-5 border-b border-ink/10">
        <Image src="/logo-mark.svg" alt="Ave Letter" width={28} height={28} className="h-7 w-auto" />
        <span className="text-[13px] tracking-[0.18em] uppercase font-medium">
          Ave Letter <span className="text-gold">CRM</span>
        </span>
      </Link>
      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-5 py-2.5 text-[13px] tracking-wide transition-colors ${
              isActive(item.href)
                ? "text-ink font-medium bg-gold/10 border-r-2 border-gold"
                : "text-muted hover:text-ink hover:bg-ink/5"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-ink/10 px-5 py-4 space-y-2">
        <p className="text-[12px] text-muted truncate">{userName}</p>
        <div className="flex items-center gap-3 text-[12px]">
          <Link href="/" className="avelink text-olive" target="_blank">
            Vezi site →
          </Link>
          <button
            type="button"
            className="text-muted hover:text-ink cursor-pointer"
            onClick={async () => {
              await crmLogout();
              qc.clear();
              router.push("/crm/login");
            }}
          >
            Ieșire
          </button>
        </div>
      </div>
    </aside>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/crm/login";

  const { data: user, isLoading } = useQuery({
    queryKey: ["crm", "auth", "me"],
    queryFn: crmMe,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!isLogin && !isLoading && !user) {
      router.replace("/crm/login");
    }
  }, [isLogin, isLoading, user, router]);

  if (isLogin) return <>{children}</>;

  if (isLoading || !user) {
    return (
      <div className="min-h-screen grid place-items-center text-muted text-sm">
        Se încarcă…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar userName={user.name} />
      <div className="flex flex-col flex-1 min-w-0 min-h-screen">
        <div className="lg:hidden">
          <MobileHeader userName={user.name} />
        </div>
        <main className="flex-1 min-w-0 px-4 py-5 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
        <MobileTabBar userName={user.name} />
      </div>
    </div>
  );
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthGate>{children}</AuthGate>
      </ToastProvider>
    </QueryClientProvider>
  );
}
