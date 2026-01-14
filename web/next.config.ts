import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Ensure Turbopack resolves dependencies relative to the Next.js app (this folder),
    // not an inferred monorepo root (e.g. if there are multiple lockfiles).
    root: __dirname,
  },
};

export default nextConfig;
