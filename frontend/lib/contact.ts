import type { SiteConfigData } from "@/lib/api";

/** Defaults used when CRM / site-config fields are empty. */
export const CONTACT_DEFAULTS = {
  email: "adina@aveletter.ro",
  phone: "+40746986415",
  phoneDisplay: "+40 746 986 415",
  location: "Râmnicu Vâlcea, România",
  facebook: "https://www.facebook.com/aveletterstudio/",
  instagram: "https://www.instagram.com/aveletterstudio/",
  instagramHandle: "@aveletterstudio",
} as const;

export type ResolvedContact = {
  email: string;
  phone: string;
  phoneDisplay: string;
  location: string;
  facebook: string;
  instagram: string;
  instagramHandle: string;
};

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("40") && digits.length === 11) {
    return `+40 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return phone;
}

function instagramHandle(url: string): string {
  const match = url.match(/instagram\.com\/([^/?#]+)/i);
  return match ? `@${match[1]}` : CONTACT_DEFAULTS.instagramHandle;
}

/** Merge public site-config with hardcoded fallbacks (location has no API field yet). */
export function resolveContact(
  config?: Pick<
    SiteConfigData,
    "contact_email" | "contact_phone" | "instagram_url" | "facebook_url"
  > | null,
): ResolvedContact {
  const email = config?.contact_email?.trim() || CONTACT_DEFAULTS.email;
  const phoneRaw = (config?.contact_phone?.trim() || CONTACT_DEFAULTS.phone).replace(/\s/g, "");
  const instagram = config?.instagram_url?.trim() || CONTACT_DEFAULTS.instagram;
  const facebook = config?.facebook_url?.trim() || CONTACT_DEFAULTS.facebook;

  return {
    email,
    phone: phoneRaw,
    phoneDisplay: formatPhoneDisplay(phoneRaw),
    location: CONTACT_DEFAULTS.location,
    facebook,
    instagram,
    instagramHandle: instagramHandle(instagram),
  };
}
