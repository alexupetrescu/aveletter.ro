import { CartProvider } from "@/lib/cart";
import LoggedInTopbar from "@/components/LoggedInTopbar";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { getSiteConfig } from "@/lib/api";
import { organization } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await getSiteConfig().catch(() => null);
  return (
    <CartProvider>
      <JsonLd data={organization(config)} />
      <div className="sticky top-0 z-50">
        <LoggedInTopbar />
        <Nav />
      </div>
      <main className="flex-1">{children}</main>
      <Footer />
    </CartProvider>
  );
}
