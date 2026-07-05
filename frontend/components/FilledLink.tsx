import Link from "next/link";
import type { ComponentProps } from "react";

/** Hardcoded — avoids Tailwind layer / .avelink conflicts on dark CTAs. */
export const filledCtaStyle = {
  backgroundColor: "#1a1a1a",
  color: "#fcfcfa",
  textDecoration: "none",
} as const;

type FilledLinkProps = Omit<ComponentProps<typeof Link>, "style"> & {
  className?: string;
  style?: React.CSSProperties;
};

export default function FilledLink({
  className = "",
  style,
  ...props
}: FilledLinkProps) {
  return (
    <Link
      {...props}
      className={`inline-block px-[34px] py-4 text-xs tracking-[2px] transition-opacity hover:opacity-85 ${className}`}
      style={{ ...filledCtaStyle, ...style }}
    />
  );
}
