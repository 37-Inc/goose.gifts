import type { Metadata } from "next";
import { previewMetadata } from "../lib/metadata";
import { isFixtureRelease } from "../lib/catalog";
import { StaticAnalytics } from "../components/StaticAnalytics";
import { show } from "../lib/show-data";
import { isSitePreview, isSiteProduction, siteIdentity } from "../lib/site-identity";
import "./styles.css";

export const metadata: Metadata = {
  ...previewMetadata(
    "Ridiculous gifts. Excellent taste.",
    isFixtureRelease
      ? `An isolated, noindex ${siteIdentity.name} design and static-export preview. Illustrative fixtures are not products for sale.`
      : isSitePreview ? `An isolated, noindex ${siteIdentity.name} staging preview using a bounded catalog cohort. This is not a public launch.`
        : `${siteIdentity.name}: ${siteIdentity.tagline}`,
    "/",
  ),
  icons: { icon: "/favicon.ico" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {isSiteProduction && process.env.NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED === "true" &&
          !isFixtureRelease && <StaticAnalytics />}
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {(isSitePreview || isFixtureRelease) && <div className="preview-notice">
          {isFixtureRelease
            ? "Private design proof · illustrative examples, not purchasable products"
            : "Private staging preview · not a public launch"}
        </div>}
        <header className="site-header">
          <a className="wordmark" href="/" aria-label={`${siteIdentity.name} home`}>
            {siteIdentity.brand}<span>.</span>gifts
          </a>
          <nav aria-label="Main navigation">
            <a className="nav-secondary" href="/gifts">The collection</a>
            <a className="nav-random" href="/random-gift">Surprise me</a>
            {show.latest && <a className="nav-show" href="/howie">From the show</a>}
            <a className="nav-secondary" href="/gift-guides">Gift guides</a>
            <a href="/#catalog-search" className="nav-search">
              Search <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </header>
        {children}
        <footer>
          <a className="wordmark" href="/">
            {siteIdentity.brand}<span>.</span>gifts
          </a>
          <p>{siteIdentity.tagline}</p>
          <p className="quiet">
            {isFixtureRelease
              ? "Staging only. Original illustrative assets; no merchant photography or current-offer claims. "
              : isSitePreview ? "Staging only. " : ""}
            We may earn a commission. As an Amazon Associate we earn from
            qualifying purchases.
          </p>
          <div className="footer-bottom">
            <span>© Thirty Seven Inc.</span>
            <a href="/weird-gift-index">Weird Gift Index</a>
            <a href="mailto:goosegifts@37.technology">Contact</a>
            <a href="/privacy">Privacy</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
