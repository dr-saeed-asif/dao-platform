import type { NextConfig } from "next";

const apiOrigin = process.env.DAO_API_ORIGIN ?? "http://127.0.0.1:3002";

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 910_000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
