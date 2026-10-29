import { browse, catalog, isFixtureRelease } from "../../lib/catalog";
import { previewMetadata } from "../../lib/metadata";
import { selectShowPicks, SHOW_PICK_COPY } from "../../lib/show-rehearsal";
import { ProductCard } from "../../components/ProductCard";
import { ShowRehearsal } from "../../components/ShowRehearsal";
import type { PublicCatalogProduct } from "../../../lib/catalog/types";
import type { CatalogCard } from "../../lib/card-shard";

export const metadata = previewMetadata("Stupid gifts. Excellent taste.",
  "A hand-picked assortment of unusual gifts.", "/h", { indexable: false, fixture: isFixtureRelease });

export default function ShowRehearsalPage() {
  const picks = selectShowPicks(catalog);
  const pickIds = new Set(picks.map((product) => product.id));
  const opening = [...browse.opening, ...browse.feed.initial].filter((product) => !pickIds.has(product.id)).slice(0, 6);
  const grid = (products: (PublicCatalogProduct | CatalogCard)[], context: string) => <div className="catalog-grid">
    {products.map((product, index) => <ProductCard key={product.id} product={product} lead={index === 0} eager context={context}
      presentation={context === "show-curated" ? SHOW_PICK_COPY[product.slug] : undefined} />)}
  </div>;
  return <main id="main" className="site-main show-rehearsal">
    <div className="opening-line"><h1>Stupid gifts. <span>Excellent taste.</span></h1></div>
    <ShowRehearsal opening={grid(opening, "show-opening")}
      picks={picks.length ? grid(picks, "show-curated") : <p>These picks are being refreshed. Please visit the homepage to browse gifts.</p>} />
  </main>;
}
