import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in /home/yarrut otherwise wins workspace detection.
  turbopack: { root: __dirname },
};

export default nextConfig;
