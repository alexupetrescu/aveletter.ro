"use client";

import { useEffect, useState } from "react";

export function SaveStatusIndicator({
  pending,
  saved,
}: {
  pending: boolean;
  saved: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pending) {
      setVisible(true);
      return;
    }
    if (saved) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2500);
      return () => clearTimeout(timer);
    }
    setVisible(false);
  }, [pending, saved]);

  if (!visible) return null;

  return (
    <span
      className={`text-[12px] tracking-wide transition-opacity ${
        pending ? "text-muted" : "text-olive"
      }`}
      aria-live="polite"
    >
      {pending ? "Se salvează…" : "Salvat"}
    </span>
  );
}
