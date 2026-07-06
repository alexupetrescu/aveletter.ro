import { CartProvider } from "@/lib/cart";
import LoggedInTopbar from "@/components/LoggedInTopbar";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <CartProvider>
      <div className="sticky top-0 z-50">
        <LoggedInTopbar />
        <Nav />
      </div>
      <main className="flex-1">{children}</main>
      <Footer />
    </CartProvider>
  );
}
