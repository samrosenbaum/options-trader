import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Disable ISR to prevent caching issues
    isrMemoryCacheSize: 0,
  },
  // Force dynamic rendering
  output: 'standalone',
};

export default nextConfig;
