import path from "node:path";
import type { NextConfig } from "next";

// Deliberately separate from the still-live Vercel app and its build settings.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  turbopack: { root: path.resolve(import.meta.dirname, "..") },
};
export default config;
