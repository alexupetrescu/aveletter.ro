export const PUBLISH_STATUS_OPTIONS = [
  { value: "draft", label: "Ciornă" },
  { value: "published", label: "Publicat" },
  { value: "archived", label: "Arhivat" },
] as const;

export type PublishStatus = (typeof PUBLISH_STATUS_OPTIONS)[number]["value"];

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
