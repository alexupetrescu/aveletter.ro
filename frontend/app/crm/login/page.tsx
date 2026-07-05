"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { crmLogin } from "@/lib/crm-api";

export default function CrmLoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await crmLogin(username, password);
      qc.setQueryData(["crm", "auth", "me"], user);
      router.push("/crm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Autentificare eșuată.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo-mark.svg" alt="Ave Letter" width={44} height={44} className="h-11 w-auto mb-4" />
          <h1 className="font-serif text-3xl">Atelier</h1>
          <p className="text-[13px] text-muted mt-1 tracking-wide">
            Panou de administrare Ave Letter
          </p>
        </div>
        <form
          onSubmit={onSubmit}
          className="bg-white/70 border border-ink/10 rounded-sm px-7 py-8 space-y-5"
        >
          <div>
            <label className="block text-[12px] tracking-[0.14em] uppercase text-muted mb-1.5">
              Utilizator
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full border border-ink/15 rounded-sm px-3 py-2 text-sm bg-paper focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-[12px] tracking-[0.14em] uppercase text-muted mb-1.5">
              Parolă
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full border border-ink/15 rounded-sm px-3 py-2 text-sm bg-paper focus:outline-none focus:border-gold"
            />
          </div>
          {error && (
            <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-ink text-paper text-[13px] tracking-[0.16em] uppercase py-3 rounded-sm hover:bg-olive transition-colors disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Se autentifică…" : "Intră în cont"}
          </button>
        </form>
      </div>
    </div>
  );
}
