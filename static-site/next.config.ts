import path from "node:path";
import fs from "node:fs";
import type { NextConfig } from "next";

const published = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../content/show/published.json"), "utf8")) as unknown[];

// Deliberately separate from the still-live Vercel app and its build settings.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  // Empty dynamic params are invalid in Next export. No placeholder/draft route
  // is emitted merely to satisfy it: these files participate only after publish.
  pageExtensions: ["tsx", "ts", "jsx", "js", ...(published.length ? ["episode.tsx", "episode.ts"] : [])],
  env: {
    // Inline false as well as true, so default builds omit provider chunks.
    NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED:
      process.env.NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED === "true" ? "true" : "false",
  },
  turbopack: { root: path.resolve(import.meta.dirname, "..") },
};
export default config;
