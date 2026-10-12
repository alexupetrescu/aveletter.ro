import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ["/crm/:path*", "/cart/:path*", "/checkout/:path*"].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "aveletter.ro", pathname: "/media/**" },
      ...(process.env.NEXT_PUBLIC_API_BASE_URL ? [new URL("/media/**", process.env.NEXT_PUBLIC_API_BASE_URL)] : []),
    ],
  },
};

export default nextConfig;
