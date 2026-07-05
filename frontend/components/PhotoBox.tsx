/* Renders an asset image, or the design's striped placeholder when missing. */
import type { AssetData } from "@/lib/api";

export default function PhotoBox({
  asset,
  label = "foto",
  aspect,
  className = "",
  variant = "light",
}: {
  asset?: AssetData | null;
  label?: string;
  aspect?: string;
  className?: string;
  variant?: "light" | "dark";
}) {
  const aspectStyle = aspect ? { aspectRatio: aspect } : undefined;
  if (asset) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.url}
        alt={asset.alt_text}
        style={aspectStyle}
        className={`w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      style={aspectStyle}
      className={`${variant === "light" ? "photo-placeholder" : "photo-placeholder-dark"} ${className}`}
    >
      <span className="px-5 text-center font-mono text-[11px] text-stone">
        [ {label} ]
      </span>
    </div>
  );
}
