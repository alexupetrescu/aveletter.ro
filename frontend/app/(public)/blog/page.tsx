import { getPosts } from "@/lib/api";
import BlogIndex from "./BlogIndex";

export const revalidate = 60;

export const metadata = {
  title: "Blog — Ave Letter Studio",
  description:
    "Povești din atelier, inspirație pentru cadouri și gânduri despre arta scrisului de mână.",
};

export default async function BlogPage() {
  let posts: Awaited<ReturnType<typeof getPosts>> = [];
  try {
    posts = await getPosts();
  } catch {
    posts = [];
  }

  return (
    <div>
      {/* PAGE HEADER */}
      <div className="mx-auto max-w-[1440px] px-6 pt-[84px] pb-10 text-center lg:px-12">
        <div className="mb-2 font-script text-[28px] text-olive">
          jurnal de atelier
        </div>
        <h1 className="mb-[18px] font-serif text-[40px] font-medium lg:text-[52px]">
          Blog
        </h1>
        <p className="mx-auto max-w-[520px] text-[14.5px] leading-[1.8] text-muted">
          Povești din atelier, inspirație pentru cadouri și câteva gânduri
          despre arta scrisului de mână.
        </p>
      </div>

      <BlogIndex posts={posts} />

      {/* NEWSLETTER */}
      <div className="border-t border-ink/8 bg-paper px-6 py-20 text-center lg:px-12 lg:py-[100px]">
        <div className="mx-auto max-w-[520px]">
          <h2 className="mb-4 font-serif text-[32px] font-medium">
            Nu rata articolele noi
          </h2>
          <p className="mb-8 text-[14.5px] leading-[1.7] text-muted">
            O dată pe lună, povești din atelier direct în inbox.
          </p>
          <form className="mx-auto flex max-w-[420px] border-b border-ink">
            <input
              placeholder="adresa ta de email"
              className="flex-1 bg-transparent px-1 py-3.5 font-sans text-[13.5px] outline-none"
            />
            <button
              type="submit"
              className="cursor-pointer px-2 py-3.5 text-xs tracking-[2px]"
            >
              ABONEAZĂ-TE →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
