import type { SiteConfigData } from "@/lib/api";
import { formatDeliverySummary } from "@/lib/shipping";

export default function DeliveryNotice({
  config,
  className = "",
}: {
  config: SiteConfigData | null;
  className?: string;
}) {
  if (!config) return null;

  const summary = formatDeliverySummary(config);
  const email = config.contact_email;

  return (
    <div
      className={`text-[12.5px] leading-[1.75] text-muted ${className}`}
    >
      <p>
        Livrarea se face exclusiv pe teritoriul României.
        {summary && <> {summary}</>}
      </p>
      {email && (
        <p className="mt-1">
          Pentru livrări în afara României, scrie-ne la{" "}
          <a href={`mailto:${email}`} className="border-b border-olive text-ink">
            {email}
          </a>
          .
        </p>
      )}
    </div>
  );
}
