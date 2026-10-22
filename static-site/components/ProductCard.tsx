import { CatalogCardArt, CatalogDisclosure } from "./CatalogPhotos";
import type { PublicCatalogProduct } from "../../lib/catalog/types";
import type { CatalogCard } from "../lib/card-shard";
import { isIllustrative } from "../lib/selection";

export function ProductCard({
  product,
  lead = false,
  context = "catalog",
}: {
  product: PublicCatalogProduct | CatalogCard;
  lead?: boolean;
  context?: string;
}) {
  const illustrative =
    "illustrative" in product ? product.illustrative : isIllustrative(product);
  return (
    <article className={`product-card ${lead ? "lead-card" : ""}`}
      data-analytics-card={illustrative ? undefined : ""}
      data-analytics-id={illustrative ? undefined : product.id}
      data-analytics-source={illustrative ? undefined : product.source}
      data-analytics-context={context}
      data-analytics-expiry={product.eligibleUntil ?? undefined}
      data-analytics-permanent={product.eligibleUntil === null ? "" : undefined}>
      <CatalogCardArt
        href={`/gifts/${product.slug}`}
        label={`View ${product.title}`}
        illustrative={illustrative}
        id={product.id}
        imageUrl={product.imageUrl}
        alt={
          illustrative
            ? `Original illustration for a fictional ${product.title}`
            : product.title
        }
        className="object-contain"
        sizes={
          lead
            ? "(max-width: 700px) 90vw, 60vw"
            : "(max-width: 700px) 90vw, 30vw"
        }
        priority={lead}
      />
      <div className="card-copy">
        {illustrative && <p className="eyebrow">Illustrative fixture · not for sale</p>}
        <h2>
          <a data-analytics-product-link="" href={`/gifts/${product.slug}`}>
            {product.punnyTitle || product.title}
          </a>
        </h2>
        {!illustrative && <CatalogDisclosure source={product.source} id={product.id} />}
        {(product.wittyDescription || product.description) !== (product.punnyTitle || product.title) &&
          <p>{product.wittyDescription || product.description}</p>}
        <a data-analytics-product-link="" className="text-action" href={`/gifts/${product.slug}`}>
          {illustrative ? "Explore the example" : "View gift"}
        </a>
      </div>
    </article>
  );
}
