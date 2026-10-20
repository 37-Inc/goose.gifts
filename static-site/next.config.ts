import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import type { NextConfig } from "next";

// Next's transpiled config has no reliable relative module filename. Resolve
// this small shared validator explicitly, without duplicating its allowlist.
const { siteSourceMode } = createRequire(import.meta.url)(path.resolve(import.meta.dirname, "lib/site-identity.ts")) as typeof import("./lib/site-identity");

const published = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../content/show/published.json"), "utf8")) as unknown[];
const snapshot = JSON.parse(fs.readFileSync(path.resolve(process.env.CATALOG_SNAPSHOT_PATH
  || path.resolve(import.meta.dirname, "fixtures/catalog.snapshot.json")), "utf8")) as { products: unknown[]; heldProducts: unknown[] };
const hasProductRoutes = snapshot.products.length > 0;

// Deliberately separate from the still-live Vercel app and its build settings.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  // Empty dynamic params are invalid in Next export. Omit empty route families
  // instead of inventing product placeholders or publishing draft episodes.
  pageExtensions: ["tsx", "ts", "jsx", "js", ...(hasProductRoutes ? ["product.tsx"] : []),
    ...(published.length ? ["episode.tsx", "episode.ts"] : [])],
  env: {
    // Inline false as well as true, so default builds omit provider chunks.
    NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED:
      siteSourceMode !== "preview" && process.env.NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED === "true" ? "true" : "false",
    NEXT_PUBLIC_STATIC_SITE_MODE: siteSourceMode,
  },
  turbopack: { root: path.resolve(import.meta.dirname, "..") },
};
export default config;
