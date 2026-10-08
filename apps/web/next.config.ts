import type { NextConfig } from "next";

const apiOrigin = process.env.DAO_API_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  experimental: {
    // Local Ollama 4b analysis can run for several minutes: keep the proxy
    // limit above the 900s agent timeout so the API returns its own response.
    proxyTimeout: 960_000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
