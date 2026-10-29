import { browse, catalog, isFixtureRelease } from "../../lib/catalog";
import { previewMetadata } from "../../lib/metadata";
import { selectShowPicks, SHOW_PICK_COPY } from "../../lib/show-rehearsal";
import { ProductCard } from "../../components/ProductCard";
import { ShowRehearsal } from "../../components/ShowRehearsal";
import { ProductImage } from "../../../components/ProductImage";
import { Icon } from "../../components/Icon";
import type { PublicCatalogProduct } from "../../../lib/catalog/types";
import type { CatalogCard } from "../../lib/card-shard";

const openerUrl = "https://testicuzzi.com/product/testicuzzi-bottle-opener-keychain/";
const openerImage = "https://i0.wp.com/testicuzzi.com/wp-content/uploads/2025/05/PenisBottleOpener1.png?fit=800%2C800&ssl=1";

export const metadata = previewMetadata("Stupid gifts. Excellent taste.",
  "A hand-picked assortment of unusual gifts.", "/h", { indexable: false, fixture: isFixtureRelease });

export default function ShowRehearsalPage() {
  const picks = selectShowPicks(catalog);
  const pickIds = new Set(picks.map((product) => product.id));
  const opening = [...browse.opening, ...browse.feed.initial].filter((product) => !pickIds.has(product.id)).slice(0, 6);
  const grid = (products: (PublicCatalogProduct | CatalogCard)[], context: string) => <div className="catalog-grid">
    {context === "show-curated" && !isFixtureRelease && <article className="product-card lead-card">
      <a className="product-art retailer-art" href={openerUrl}
        aria-label="See the penis bottle opener at Testicuzzi">
        <ProductImage imageUrl={openerImage}
          alt="Silver penis-shaped bottle opener keychain" className="object-contain" sizes="(max-width: 700px) 45vw, 30vw" priority />
      </a>
      <div className="card-copy">
        <h2><a href={openerUrl}>Penis bottle opener</a></h2>
        <p>A bottle opener that leaves very little to the imagination.</p>
        <a className="card-action" href={openerUrl}>Shop at Testicuzzi <Icon name="arrow" /></a>
      </div>
    </article>}
    {products.map((product, index) => <ProductCard key={product.id} product={product} lead={index === 0 && (context !== "show-curated" || isFixtureRelease)} eager context={context}
      presentation={context === "show-curated" ? SHOW_PICK_COPY[product.slug] : undefined} />)}
  </div>;
  return <main id="main" className="site-main show-rehearsal">
    <div className="opening-line"><h1>Stupid gifts. <span>Excellent taste.</span></h1></div>
    <ShowRehearsal opening={grid(opening, "show-opening")}
      picks={picks.length ? grid(picks, "show-curated") : <p>These picks are being refreshed. Please visit the homepage to browse gifts.</p>} />
  </main>;
}
