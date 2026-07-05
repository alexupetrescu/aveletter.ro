import { getCategories, getProducts } from "@/lib/api";
import ShopIndex from "./ShopIndex";

export const revalidate = 60;

export const metadata = {
  title: "Produse — Ave Letter Studio",
  description:
    "Fiecare piesă este scrisă și lucrată manual, cu grijă pentru detaliu.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string }>;
}) {
  const { categorie } = await searchParams;

  let products: Awaited<ReturnType<typeof getProducts>> = [];
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  try {
    [products, categories] = await Promise.all([
      getProducts(),
      getCategories(),
    ]);
  } catch {
    // backend down: render empty state
  }

  return (
    <div>
      {/* PAGE HEADER */}
      <div className="mx-auto max-w-[1440px] px-6 pt-[84px] pb-10 text-center lg:px-12">
        <div className="mb-2 font-script text-[28px] text-olive">
          atelier de caligrafie
        </div>
        <h1 className="mb-[18px] font-serif text-[40px] font-medium lg:text-[52px]">
          Produse
        </h1>
        <p className="mx-auto max-w-[520px] text-[14.5px] leading-[1.8] text-muted">
          Fiecare piesă este scrisă și lucrată manual, cu grijă pentru
          detaliu. Comenzi noi de sezon, mereu.
        </p>
      </div>

      <ShopIndex
        products={products}
        categories={categories}
        initialCategory={categorie ?? null}
      />
    </div>
  );
}
