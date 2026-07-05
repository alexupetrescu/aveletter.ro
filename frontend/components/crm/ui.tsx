"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(
  () => {},
);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-sm text-[13px] shadow-lg border ${
              t.tone === "success"
                ? "bg-ink text-paper border-ink"
                : "bg-red-700 text-white border-red-800"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Page scaffolding
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="font-serif text-[28px] leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white/70 border border-ink/10 rounded-sm ${className}`}>
      {title && (
        <h2 className="text-[12px] tracking-[0.16em] uppercase text-muted px-5 pt-4 pb-3 border-b border-ink/8">
          {title}
        </h2>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BUTTON_STYLES = {
  primary:
    "bg-ink text-paper hover:bg-olive disabled:opacity-50",
  subtle:
    "border border-ink/20 text-ink hover:border-ink/50 disabled:opacity-50",
  danger:
    "border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_STYLES;
}) {
  return (
    <button
      type="button"
      className={`px-4 py-2 rounded-sm text-[12px] tracking-[0.12em] uppercase transition-colors cursor-pointer ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function ConfirmDeleteButton({
  onConfirm,
  label = "Șterge",
  message = "Sigur vrei să ștergi? Acțiunea nu poate fi anulată.",
  disabled,
}: {
  onConfirm: () => void;
  label?: string;
  message?: string;
  disabled?: boolean;
}) {
  const [arming, setArming] = useState(false);

  useEffect(() => {
    if (!arming) return;
    const timer = setTimeout(() => setArming(false), 4000);
    return () => clearTimeout(timer);
  }, [arming]);

  if (arming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-[12px] text-red-700">{message}</span>
        <Button variant="danger" onClick={() => { setArming(false); onConfirm(); }}>
          Confirmă
        </Button>
        <Button variant="subtle" onClick={() => setArming(false)}>
          Anulează
        </Button>
      </span>
    );
  }
  return (
    <Button variant="danger" disabled={disabled} onClick={() => setArming(true)}>
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[12px] tracking-[0.12em] uppercase text-muted mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[12px] text-stone mt-1">{hint}</span>}
    </label>
  );
}

const INPUT_CLASS =
  "w-full border border-ink/15 rounded-sm px-3 py-2 text-sm bg-paper focus:outline-none focus:border-gold disabled:opacity-60";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_CLASS} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={props.rows ?? 3}
      {...props}
      className={`${INPUT_CLASS} ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${INPUT_CLASS} ${props.className ?? ""}`} />
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[#5a6437]"
      />
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-[12px] text-stone">{hint}</span>}
      </span>
    </label>
  );
}

/** Edits an integer bani amount as lei with 2 decimals. */
export function MoneyInput({
  value,
  onChange,
  allowEmpty = false,
  allowNegative = false,
}: {
  value: number | null;
  onChange: (bani: number | null) => void;
  allowEmpty?: boolean;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : (value / 100).toFixed(2));

  useEffect(() => {
    setText(value === null ? "" : (value / 100).toFixed(2));
  }, [value]);

  return (
    <div className="relative">
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const trimmed = text.trim().replace(",", ".");
          if (trimmed === "" && allowEmpty) {
            onChange(null);
            return;
          }
          const parsed = parseFloat(trimmed);
          if (Number.isFinite(parsed) && (allowNegative || parsed >= 0)) {
            onChange(Math.round(parsed * 100));
          } else {
            setText(value === null ? "" : (value / 100).toFixed(2));
          }
        }}
        className={`${INPUT_CLASS} pr-11`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-stone">
        lei
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_TONES: Record<string, string> = {
  draft: "bg-stone/15 text-soft",
  published: "bg-olive/15 text-olive",
  archived: "bg-ink/10 text-muted",
  pending_payment: "bg-gold/15 text-gold",
  paid: "bg-olive/15 text-olive",
  in_production: "bg-blue-100 text-blue-800",
  ready_to_ship: "bg-purple-100 text-purple-800",
  shipped: "bg-blue-100 text-blue-800",
  completed: "bg-olive/20 text-olive",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-red-100 text-red-700",
  succeeded: "bg-olive/15 text-olive",
  failed: "bg-red-100 text-red-700",
  Live: "bg-olive/15 text-olive",
  Programat: "bg-gold/15 text-gold",
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-sm text-[11px] tracking-wide uppercase ${
        STATUS_TONES[value] ?? "bg-ink/10 text-muted"
      }`}
    >
      {label ?? value.replace(/_/g, " ")}
    </span>
  );
}
