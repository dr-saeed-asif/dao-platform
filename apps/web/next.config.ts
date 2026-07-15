import type { NextConfig } from "next";

const apiOrigin = process.env.DAO_API_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
