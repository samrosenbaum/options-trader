import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Force new build ID on every deploy to bust CDN cache
  generateBuildId: async () => {
    return `build-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  },
};

export default nextConfig;
