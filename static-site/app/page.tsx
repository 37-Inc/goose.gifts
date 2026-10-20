import { browse } from "../lib/catalog";
import { ProductCard } from "../components/ProductCard";
import { Search } from "../components/Search";
import { CatalogFeed } from "../components/CatalogFeed";

export default function Home() {
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
          <ProductCard key={product.id} product={product} lead={index === 0} />
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
