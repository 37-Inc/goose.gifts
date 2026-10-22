import { browse, isFixtureRelease } from "../lib/catalog";
import { previewMetadata } from "../lib/metadata";
import { isSitePreview, siteIdentity } from "../lib/site-identity";
import { ProductCard } from "../components/ProductCard";
import { Search } from "../components/Search";
import { CatalogFeed } from "../components/CatalogFeed";
import { GuideIcon } from "../components/GuideIcon";
import { Icon } from "../components/Icon";
import SafeCatalog from "./safe/catalog/page";

export const metadata = previewMetadata("Stupid gifts. Excellent taste.",
  isSitePreview || isFixtureRelease ? "An isolated static preview, not a public launch."
    : `${siteIdentity.name}: ${siteIdentity.tagline}`, "/",
  { indexable: browse.opening.length > 0, fixture: isFixtureRelease });

export default function Home() {
  if (!browse.opening.length) return <SafeCatalog />;
  return (
    <main id="main" className="site-main">
      <div className="opening-line">
        <h1>
          Stupid gifts. <span>Excellent taste.</span>
        </h1>
      </div>
      <div className="opening-grid">
        {browse.opening.map((product, index) => (
          <ProductCard key={product.id} product={product} lead={index === 0} context="home_opening" />
        ))}
      </div>
      <Search />
      <CatalogFeed
        initial={browse.feed.initial}
        next={browse.feed.next}
        catalogRevision={browse.catalogRevision}
        version={browse.version}
      />
      <section className="section-block">
        <div className="section-heading">
          <h2>Gift guides</h2>
          <a className="text-action" href="/gift-guides">
            All guides
          </a>
        </div>
        <div className="guide-links">
          <a href="/gift-guides/white-elephant-gifts">
            <GuideIcon slug="white-elephant-gifts" /> The gift exchange <Icon name="chevron" />
          </a>
          <a href="/gift-guides/funny-gifts-for-coworkers">
            <GuideIcon slug="funny-gifts-for-coworkers" /> The office <Icon name="chevron" />
          </a>
          <a href="/random-gift">
            <Icon name="dice" className="guide-icon" /> Surprise me <Icon name="chevron" />
          </a>
        </div>
      </section>
    </main>
  );
}
