import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ApiError, getPost, getPosts } from "@/lib/api";
import PhotoBox from "@/components/PhotoBox";
import TiptapRenderer, { hasTiptapContent } from "@/components/TiptapRenderer";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = await getPost(slug);
    const title = post.seo_title || `${post.title} — Ave Letter Studio`;
    const description = post.seo_description || post.excerpt;
    return {
      title,
      description,
      openGraph: { title, description, type: "article" },
    };
  } catch {
    return { title: "Articol — Ave Letter Studio" };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let post;
  try {
    post = await getPost(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  let related: Awaited<ReturnType<typeof getPosts>> = [];
  try {
    related = (await getPosts()).filter((p) => p.slug !== slug).slice(0, 3);
  } catch {
    related = [];
  }

  const paragraphs = post.body_text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div>
      {/* BREADCRUMB */}
      <div className="mx-auto flex max-w-[820px] items-center gap-2 px-6 pt-10 text-xs text-stone lg:px-12">
        <Link href="/" className="avelink text-stone">
          Prima pagină
        </Link>
        <span>/</span>
        <Link href="/blog" className="avelink text-stone">
          Blog
        </Link>
        <span>/</span>
        <span className="truncate text-body">{post.title}</span>
      </div>

      {/* POST HEADER */}
      <div className="mx-auto max-w-[820px] px-6 pt-[30px] text-center lg:px-12">
        <div className="mb-[18px] text-[11px] tracking-[2px] text-olive uppercase">
          {post.category?.name ?? "JURNAL"} · {formatDate(post.published_at)}
          {post.reading_time > 0 && <> · {post.reading_time} MIN DE CITIT</>}
        </div>
        <h1 className="mb-[26px] font-serif text-[34px] leading-[1.2] font-medium lg:text-[46px]">
          {post.title}
        </h1>
        <div className="font-script text-2xl text-muted">
          de {post.author_name}, Ave Letter Studio
        </div>
      </div>

      {/* FEATURED IMAGE */}
      <div className="mx-auto mt-14 max-w-[1200px] px-6 lg:px-12">
        <PhotoBox
          asset={post.featured_image}
          aspect="16/8"
          label="foto articol"
        />
      </div>

      {/* BODY */}
      <div className="posttext mx-auto max-w-[700px] px-6 pt-[70px] pb-10 lg:px-12">
        {hasTiptapContent(post.body) ? (
          <TiptapRenderer doc={post.body} />
        ) : paragraphs.length > 0 ? (
          paragraphs.map((paragraph, i) =>
            paragraph.startsWith("„") && paragraph.length > 120 ? (
              <blockquote key={i}>{paragraph}</blockquote>
            ) : (
              <p key={i}>{paragraph}</p>
            ),
          )
        ) : (
          <p>{post.excerpt}</p>
        )}
      </div>

      {/* AUTHOR */}
      <div className="mx-auto flex max-w-[700px] items-center gap-6 border-t border-ink/10 px-6 pt-11 pb-[90px] lg:px-12">
        <div className="photo-placeholder size-16 shrink-0 rounded-full">
          <span className="font-mono text-[8px] text-stone">[ foto ]</span>
        </div>
        <div>
          <div className="mb-1 font-serif text-[19px] font-medium">
            {post.author_name}
          </div>
          <div className="text-[13px] leading-[1.7] text-muted">
            Caligrafiază de aproximativ 5 ani și conduce Ave Letter Studio, un
            atelier de cadouri personalizate.
          </div>
        </div>
      </div>

      {/* MORE ARTICLES */}
      {related.length > 0 && (
        <div className="mx-auto max-w-[1440px] px-6 pb-32 lg:px-12">
          <h2 className="mb-10 text-center font-serif text-[30px] font-medium">
            Alte articole
          </h2>
          <div className="grid grid-cols-1 gap-[38px] sm:grid-cols-3">
            {related.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="avelink block"
              >
                <PhotoBox
                  asset={p.featured_image}
                  aspect="4/3"
                  className="mb-[18px]"
                  label="foto"
                />
                <div className="mb-2 text-[10.5px] tracking-[1.5px] text-olive uppercase">
                  {p.category?.name ?? "JURNAL"}
                </div>
                <h3 className="font-serif text-[19px] leading-[1.3] font-medium">
                  {p.title}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
