import type { Metadata } from "next";
import { Beau_Rivage, Cormorant_Garamond, Jost } from "next/font/google";
import Providers from "@/components/Providers";
import { getSiteConfig } from "@/lib/api";
import "./globals.css";

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const beauRivage = Beau_Rivage({
  variable: "--font-beau-rivage",
  subsets: ["latin", "latin-ext"],
  weight: "400",
});

const defaultTitle = "Ave Letter Studio — Cadouri personalizate prin caligrafie";
const defaultDescription =
  "Cadouri și obiecte personalizate prin caligrafie, create manual într-un atelier din România.";

export async function generateMetadata(): Promise<Metadata> {
  let config = null;
  try {
    config = await getSiteConfig();
  } catch {
    // fallback to defaults
  }
  const title = config?.default_seo_title || defaultTitle;
  const description = config?.default_seo_description || defaultDescription;
  const domain = config?.domain || "aveletter.ro";
  const ogImage = config?.default_og_image_url;

  return {
    metadataBase: new URL(`https://${domain}`),
    title: {
      default: title,
      template: "%s — Ave Letter Studio",
    },
    description,
    openGraph: {
      title,
      description,
      locale: "ro_RO",
      type: "website",
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    icons: {
      icon: [
        { url: "/favicon_io/favicon.ico" },
        {
          url: "/favicon_io/favicon-16x16.png",
          sizes: "16x16",
          type: "image/png",
        },
        {
          url: "/favicon_io/favicon-32x32.png",
          sizes: "32x32",
          type: "image/png",
        },
      ],
      apple: "/favicon_io/apple-touch-icon.png",
    },
    manifest: "/favicon_io/site.webmanifest",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
      className={`${jost.variable} ${cormorant.variable} ${beauRivage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
