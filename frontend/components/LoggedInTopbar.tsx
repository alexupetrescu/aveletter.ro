"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { crmMe } from "@/lib/crm-api";

export default function LoggedInTopbar() {
  const pathname = usePathname();
  const onCrm = pathname.startsWith("/crm") && pathname !== "/crm/login";

  const { data: user } = useQuery({
    queryKey: ["crm", "auth", "me"],
    queryFn: crmMe,
    staleTime: 60_000,
    retry: false,
  });

  if (!user) return null;

  return (
    <div className="border-b border-ink/10 bg-ink text-[12px] text-paper">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-2 lg:px-12">
        <p className="truncate text-paper/80">
          Conectat ca <span className="font-medium text-paper">{user.name}</span>
        </p>
        {onCrm ? (
          <Link href="/" className="avelink shrink-0 font-medium text-gold hover:opacity-100">
            To website →
          </Link>
        ) : (
          <Link href="/crm" className="avelink shrink-0 font-medium text-gold hover:opacity-100">
            To dashboard →
          </Link>
        )}
      </div>
    </div>
  );
}
