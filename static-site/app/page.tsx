import { browse, isFixtureRelease } from "../lib/catalog";
import { previewMetadata } from "../lib/metadata";
import { isSitePreview, siteIdentity } from "../lib/site-identity";
import { ProductCard } from "../components/ProductCard";
import { Search } from "../components/Search";
import { CatalogFeed } from "../components/CatalogFeed";
import SafeCatalog from "./safe/catalog/page";

export const metadata = previewMetadata("Ridiculous gifts. Excellent taste.",
  isSitePreview || isFixtureRelease ? "An isolated static preview, not a public launch."
    : `${siteIdentity.name}: ${siteIdentity.tagline}`, "/",
  { indexable: browse.opening.length > 0, fixture: isFixtureRelease });

export default function Home() {
  if (!browse.opening.length) return <SafeCatalog />;
  return (
    <main id="main" className="site-main">
      <div className="opening-line">
        <h1>
          Ridiculous gifts. <span>Excellent taste.</span>
        </h1>
        <span className="quiet desktop-note">
          A well-considered collection of bad ideas.
        </span>
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
          <h2>For a particular kind of person.</h2>
          <a className="text-action" href="/gift-guides">
            All gift guides ↗
          </a>
        </div>
        <div className="guide-links">
          <a href="/gift-guides/white-elephant-gifts">
            <span>01</span> The gift exchange <span>↗</span>
          </a>
          <a href="/gift-guides/funny-gifts-for-coworkers">
            <span>02</span> The office <span>↗</span>
          </a>
          <a href="/random-gift">
            <span>03</span> Leave it to chance <span>↗</span>
          </a>
        </div>
      </section>
    </main>
  );
}
