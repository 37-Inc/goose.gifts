import type { Metadata } from "next";
import { siteIdentity } from "../../../lib/site-identity";

// Shared across held/expired URLs: no fabricated self-canonical or inherited
// homepage/product share claims. The Worker always adds noindex/no-store too.
export const metadata: Metadata = {
  title: `Selection unavailable — ${siteIdentity.name}`,
  description: "This gift is not currently in the collection. Browse other gifts instead.",
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: true, noarchive: true },
};

export default function SafeProduct() {
  return (
    <main id="main" className="site-main empty-state">
      <p className="eyebrow">Selection paused</p>
      <h1>Not currently in the collection.</h1>
      <p>
        No product details, imagery, prices or retailer links are displayed here.
        Browse the rest of the collection while we review this selection.
      </p>
      <a className="button" href="/gifts">
        Back to the collection →
      </a>
    </main>
  );
}
