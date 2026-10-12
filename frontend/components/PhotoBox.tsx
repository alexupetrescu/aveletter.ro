/* Renders an asset image, or the design's striped placeholder when missing. */
import type { AssetData } from "@/lib/api";
import Image from "next/image";

export default function PhotoBox({
  asset,
  label = "foto",
  aspect,
  className = "",
  variant = "light",
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  asset?: AssetData | null;
  label?: string;
  aspect?: string;
  className?: string;
  variant?: "light" | "dark";
  priority?: boolean;
  sizes?: string;
}) {
  const aspectStyle = aspect ? { aspectRatio: aspect } : undefined;
  if (asset) {
    return (
      <div className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: aspect || `${asset.width || 4}/${asset.height || 3}` }}>
        <Image
          src={asset.url}
          alt={asset.alt_text || label}
          fill
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          unoptimized={process.env.NODE_ENV !== "production" || !asset.url.startsWith("https://aveletter.ro/media/")}
          className="object-cover"
        />
      </div>
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
