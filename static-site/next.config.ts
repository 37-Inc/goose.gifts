import path from "node:path";
import type { NextConfig } from "next";

// Deliberately separate from the still-live Vercel app and its build settings.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  env: {
    // Inline false as well as true, so default builds omit provider chunks.
    NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED:
      process.env.NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED === "true" ? "true" : "false",
  },
  turbopack: { root: path.resolve(import.meta.dirname, "..") },
};
export default config;
