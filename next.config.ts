import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Empty turbopack config to silence migration warning
  turbopack: {},
  webpack: (config) => {
    // Exclude extension folder from Next.js build
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules', '**/extension/**'],
    };

    return config;
  },
};

export default nextConfig;
