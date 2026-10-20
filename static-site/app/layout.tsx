import type { Metadata } from "next";
import { previewMetadata } from "../lib/metadata";
import { isFixtureRelease } from "../lib/catalog";
import "./styles.css";

export const metadata: Metadata = {
  ...previewMetadata(
    "Ridiculous gifts. Excellent taste.",
    isFixtureRelease
      ? "An isolated, noindex Stupid Gifts design and static-export preview. Illustrative fixtures are not products for sale."
      : "An isolated, noindex Stupid Gifts staging preview using a bounded catalog cohort. This is not a public launch.",
    "/",
  ),
  icons: { icon: "/favicon.svg" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="preview-notice">
          {isFixtureRelease
            ? "Private design proof · illustrative examples, not purchasable products"
            : "Private staging preview · not a public launch"}
        </div>
        <header className="site-header">
          <a className="wordmark" href="/" aria-label="Stupid Gifts home">
            stupid<span>.</span>gifts
          </a>
          <nav aria-label="Main navigation">
            <a href="/gifts">The collection</a>
            <a href="/random-gift">Surprise me</a>
            <a href="/gift-guides">Gift guides</a>
            <a href="/#catalog-search" className="nav-search">
              Search <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </header>
        {children}
        <footer>
          <a className="wordmark" href="/">
            stupid<span>.</span>gifts
          </a>
          <p>Very bad ideas. Carefully considered.</p>
          <p className="quiet">
            {isFixtureRelease
              ? "Staging only. Original illustrative assets; no merchant photography or current-offer claims. "
              : "Staging only. "}
            When retailer links are enabled, we may earn a commission. As an
            Amazon Associate we earn from qualifying purchases.
          </p>
          <div className="footer-bottom">
            <span>© Thirty Seven Inc.</span>
            <a href="mailto:goosegifts@37.technology">Contact</a>
            <a href="/privacy">Privacy</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
