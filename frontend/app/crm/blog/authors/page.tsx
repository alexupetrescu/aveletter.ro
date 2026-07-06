"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { CrmAuthorProfile } from "@/lib/crm-api";
import { useCrmList } from "@/lib/crm-hooks";
import { PageHeader } from "@/components/crm/ui";
import { DataTable } from "@/components/crm/DataTable";

export default function CrmAuthorsPage() {
  const router = useRouter();
  const { data: authors, isLoading } = useCrmList<CrmAuthorProfile[]>(
    "author-profiles",
  );

  return (
    <div>
      <PageHeader
        title="Autori"
        subtitle="Profilurile publicate sub articolele din jurnal"
        actions={
          <Link
            href="/crm/blog"
            className="avelink text-[13px] text-olive self-center"
          >
            ← Înapoi la blog
          </Link>
        }
      />
      <DataTable
        columns={[
          {
            key: "name",
            header: "Autor",
            render: (a) => (
              <div>
                <p className="font-medium">{a.user_name}</p>
                <p className="text-[12px] text-muted">ID utilizator {a.user_id}</p>
              </div>
            ),
          },
          {
            key: "bio",
            header: "Descriere",
            render: (a) =>
              a.bio ? (
                <span className="line-clamp-2 text-[13px]">{a.bio}</span>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: "photo",
            header: "Foto",
            render: (a) => (a.photo_data ? "Da" : "—"),
          },
          {
            key: "socials",
            header: "Social",
            render: (a) => {
              const links = [a.instagram_url && "Instagram", a.facebook_url && "Facebook"].filter(
                Boolean,
              );
              return links.length > 0 ? links.join(", ") : "—";
            },
          },
        ]}
        rows={authors ?? []}
        rowKey={(a) => a.user_id}
        onRowClick={(a) => router.push(`/crm/blog/authors/${a.user_id}`)}
        isLoading={isLoading}
        empty="Niciun utilizator staff găsit."
      />
    </div>
  );
}
