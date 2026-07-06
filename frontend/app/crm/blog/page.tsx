"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CrmPostList, Paginated } from "@/lib/crm-api";
import { useCrmList } from "@/lib/crm-hooks";
import { Button, PageHeader, StatusBadge } from "@/components/crm/ui";
import { DataTable, FilterChips, SearchInput } from "@/components/crm/DataTable";

export default function CrmBlogPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useCrmList<Paginated<CrmPostList>>("posts", {
    search: search || undefined,
    status: status || undefined,
    page,
  });

  return (
    <div>
      <PageHeader
        title="Blog"
        subtitle="Articolele jurnalului"
        actions={
          <>
            <Link
              href="/crm/blog/taxonomies"
              className="avelink text-[13px] text-olive self-center mr-2"
            >
              Categorii & etichete
            </Link>
            <Link
              href="/crm/blog/authors"
              className="avelink text-[13px] text-olive self-center mr-2"
            >
              Autori
            </Link>
            <Link
              href="/crm/redirects"
              className="avelink text-[13px] text-olive self-center mr-2"
            >
              Redirecturi
            </Link>
            <Button onClick={() => router.push("/crm/blog/new")}>+ Articol nou</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Titlu sau slug…"
        />
        <FilterChips
          options={[
            { value: "published", label: "Publicate" },
            { value: "draft", label: "Ciorne" },
            { value: "archived", label: "Arhivate" },
          ]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        columns={[
          {
            key: "title",
            header: "Articol",
            render: (p) => (
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-[12px] text-muted">/{p.slug}</p>
              </div>
            ),
          },
          { key: "category", header: "Categorie", render: (p) => p.category_name ?? "—" },
          { key: "author", header: "Autor", render: (p) => p.author_name },
          {
            key: "state",
            header: "Stare",
            render: (p) => (
              <StatusBadge
                value={p.status === "published" ? p.publish_state : p.status}
                label={p.publish_state}
              />
            ),
          },
          {
            key: "published",
            header: "Publicat",
            render: (p) =>
              p.published_at
                ? new Date(p.published_at).toLocaleDateString("ro-RO")
                : "—",
          },
        ]}
        rows={data?.results ?? []}
        rowKey={(p) => p.id}
        onRowClick={(p) => router.push(`/crm/blog/${p.id}`)}
        isLoading={isLoading}
        empty="Niciun articol găsit."
        page={page}
        hasNext={Boolean(data?.next)}
        hasPrevious={Boolean(data?.previous)}
        onPageChange={setPage}
        totalCount={data?.count}
      />
    </div>
  );
}
