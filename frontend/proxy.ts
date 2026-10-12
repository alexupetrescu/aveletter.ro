import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8020";
    const url = new URL("/api/blog/redirects/resolve/", base);
    url.searchParams.set("path", request.nextUrl.pathname);
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      const { new_path: path } = await response.json();
      if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")) {
        const target = new URL(path, request.url);
        if (target.origin === request.nextUrl.origin && target.pathname !== request.nextUrl.pathname) {
          target.search = request.nextUrl.search;
          return NextResponse.redirect(target, 301);
        }
      }
    }
  } catch {
    // Redirect lookup outages must not take public pages offline.
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api(?:/|$)|crm(?:/|$)|admin(?:/|$)|cart(?:/|$)|checkout(?:/|$)|_next(?:/|$)|media(?:/|$)|images/|favicon_io/|robots\\.txt$|llms\\.txt$|sitemap\\.xml$|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|css|js|woff2?)$).*)"],
};
