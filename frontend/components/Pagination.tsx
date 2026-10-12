import Link from "next/link";
import { paginatedPath } from "@/lib/seo";

export default function Pagination({ page, path, hasNext }: { page: number; path: string; hasNext: boolean }) {
  if (page === 1 && !hasNext) return null;
  return (
    <nav aria-label="Paginare" className="mx-auto flex max-w-[1440px] items-center justify-center gap-8 px-6 pb-20 text-sm">
      {page > 1 && <Link rel="prev" className="avelink" href={paginatedPath(path, page - 1)}>← Pagina anterioară</Link>}
      <span aria-current="page">Pagina {page}</span>
      {hasNext && <Link rel="next" className="avelink" href={paginatedPath(path, page + 1)}>Pagina următoare →</Link>}
    </nav>
  );
}
