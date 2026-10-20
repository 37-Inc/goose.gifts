import { catalog, isFixtureRelease } from "../../lib/catalog";
import { ProductCard } from "../../components/ProductCard";
import { previewMetadata } from "../../lib/metadata";
export const metadata = previewMetadata(
  "The collection",
  "Rights-cleared illustrative examples for the static migration proof, not purchasable products.",
  "/gifts",
);
export default function Directory() {
  return (
    <main id="main" className="site-main">
      <div className="page-heading">
        <p className="eyebrow">Consider your options</p>
        <h1>The collection.</h1>
        <p>
          {isFixtureRelease
            ? "Three fictional examples prove the browsing experience. The real opening selection is pending product and image-rights review."
            : "Useful, absurd, and worth a closer look."}
        </p>
      </div>
      <div className="catalog-grid">
        {catalog.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  );
}
