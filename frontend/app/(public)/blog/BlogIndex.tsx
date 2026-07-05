"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PostListItem } from "@/lib/api";
import PhotoBox from "@/components/PhotoBox";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BlogIndex({ posts }: { posts: PostListItem[] }) {
  const [active, setActive] = useState("Toate");

  const categoryNames = useMemo(
    () => [
      "Toate",
      ...Array.from(
        new Set(posts.map((p) => p.category?.name).filter(Boolean) as string[]),
      ),
    ],
    [posts],
  );

  const [featured, ...rest] = posts;
  const visible =
    active === "Toate"
      ? rest
      : posts.filter((p) => p.category?.name === active);

  if (posts.length === 0) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 pb-32 text-center text-muted lg:px-12">
        <p className="py-20 text-[14.5px]">
          Articolele sunt în lucru — revino curând.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* FEATURED POST */}
      {featured && active === "Toate" && (
        <div className="mx-auto max-w-[1440px] px-6 pt-5 pb-[90px] lg:px-12">
          <Link
            href={`/blog/${featured.slug}`}
            className="avelink grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-[60px]"
          >
            <PhotoBox
              asset={featured.featured_image}
              aspect="16/11"
              label="foto articol"
            />
            <div>
              <div className="mb-3.5 text-[11px] tracking-[2px] text-olive uppercase">
                {featured.category?.name ?? "JURNAL"} ·{" "}
                {formatDate(featured.published_at)}
              </div>
              <h2 className="mb-[18px] font-serif text-[28px] leading-[1.2] font-medium lg:text-[36px]">
                {featured.title}
              </h2>
              <p className="mb-6 text-[14.5px] leading-[1.85] text-muted">
                {featured.excerpt}
              </p>
              <span className="border-b border-ink pb-1 text-xs tracking-[2px]">
                CITEȘTE ARTICOLUL →
              </span>
            </div>
          </Link>
        </div>
      )}

      {/* CATEGORY FILTER */}
      <div className="mx-auto flex max-w-[1440px] flex-wrap justify-center gap-3.5 px-6 pb-14 lg:px-12">
        {categoryNames.map((name) => (
          <button
            key={name}
            onClick={() => setActive(name)}
            className={`cursor-pointer border px-[22px] py-[11px] text-[11.5px] tracking-[1.5px] ${
              name === active
                ? "border-ink bg-ink text-paper"
                : "border-ink/20 bg-transparent text-body"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* POST GRID */}
      <div className="mx-auto max-w-[1440px] px-6 pb-32 lg:px-12">
        <div className="grid grid-cols-1 gap-x-[38px] gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="avelink block"
            >
              <PhotoBox
                asset={post.featured_image}
                aspect="4/3"
                className="mb-5"
                label="foto"
              />
              <div className="mb-2.5 text-[10.5px] tracking-[1.5px] text-olive uppercase">
                {post.category?.name ?? "JURNAL"} ·{" "}
                {formatDate(post.published_at)}
              </div>
              <h3 className="mb-2.5 font-serif text-[21px] leading-[1.3] font-medium">
                {post.title}
              </h3>
              <p className="text-[13.5px] leading-[1.75] text-muted">
                {post.excerpt}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
