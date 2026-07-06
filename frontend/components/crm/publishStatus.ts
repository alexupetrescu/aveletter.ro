export const PUBLISH_STATUS_OPTIONS = [
  { value: "draft", label: "Ciornă" },
  { value: "published", label: "Publicat" },
  { value: "archived", label: "Arhivat" },
] as const;

export type PublishStatus = (typeof PUBLISH_STATUS_OPTIONS)[number]["value"];

export const PUBLISH_STATUS_LABELS: Record<PublishStatus, string> = {
  draft: "Ciornă",
  published: "Publicat",
  archived: "Arhivat",
};

/** Visual styles for fast status recognition in CRM publish controls. */
export const PUBLISH_STATUS_STYLES: Record<
  PublishStatus,
  { select: string; dot: string; label: string }
> = {
  draft: {
    select: "bg-[#f5f0e8] border-[#c4a574] text-[#7a5c2e]",
    dot: "bg-[#7a5c2e]",
    label: "text-[#7a5c2e]",
  },
  published: {
    select: "bg-[#eef4ea] border-[#8aab7a] text-[#3d5c2e]",
    dot: "bg-[#3d5c2e]",
    label: "text-[#3d5c2e]",
  },
  archived: {
    select: "bg-[#f8ecec] border-[#d4a0a0] text-[#8b3a3a]",
    dot: "bg-[#8b3a3a]",
    label: "text-[#8b3a3a]",
  },
};

export function isScheduledPublish(
  status: string,
  publishedAt: string | null,
): boolean {
  return (
    status === "published" &&
    publishedAt !== null &&
    new Date(publishedAt) > new Date()
  );
}

export function publishStatusSelectValue(
  status: string,
  publishedAt: string | null,
): PublishStatus | "scheduled" {
  if (status === "draft") return "draft";
  if (status === "archived") return "archived";
  if (isScheduledPublish(status, publishedAt)) return "scheduled";
  return "published";
}
