import type { DirectoryPage } from "../lib/directory";
import { directoryPath, directorySchema } from "../lib/directory";
import { ProductCard } from "./ProductCard";
import { JsonLd } from "./JsonLd";

export function Directory({
  page,
  illustrative,
}: {
  page: DirectoryPage;
  illustrative: boolean;
}) {
  return (
    <main id="main" className="site-main">
      <JsonLd data={directorySchema(page)} />
      <div className="page-heading">
        <p className="eyebrow">Consider your options</p>
        <h1>The collection.</h1>
        <p>
          {illustrative
            ? "Fictional examples prove the browsing experience. These objects are not products for sale."
            : "Useful, absurd, and worth a closer look."}
        </p>
      </div>
      <div className="directory-status">
        <p>
          {page.total}{" "}
          {illustrative ? "illustrative examples" : "ready products"} in this
          snapshot.
        </p>
        <p>
          Page {page.page} of {page.pageCount}
        </p>
      </div>
      {page.products.length ? (
        <div className="catalog-grid">
          {page.products.map((p) => (
            <ProductCard key={p.id} product={p} context="catalog_directory" />
          ))}
        </div>
      ) : (
        <div className="guide-pending">
          <h2>No ready selections in this snapshot.</h2>
          <p>
            Held products are not shown.{" "}
            <a href="/gift-guides">Read the gift guides →</a>
          </p>
        </div>
      )}
      {page.pageCount > 1 && (
        <nav className="pagination" aria-label="Gift catalog pages">
          {page.page > 1 && (
            <a href={directoryPath(page.page - 1)}>← Previous</a>
          )}
          <span>
            Page {page.page} of {page.pageCount}
          </span>
          {page.page < page.pageCount && (
            <a href={directoryPath(page.page + 1)}>Next →</a>
          )}
        </nav>
      )}
    </main>
  );
}
