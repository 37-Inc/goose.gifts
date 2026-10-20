import { ProductImage } from "@/components/ProductImage";
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
      data-analytics-expiry={product.eligibleUntil}>
      <a
        data-analytics-product-link=""
        className={`product-art${illustrative ? "" : " retailer-art"}`}
        href={`/gifts/${product.slug}`}
        aria-label={`View ${product.title}`}
      >
        <ProductImage
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
      </a>
      <div className="card-copy">
        <p className="eyebrow">
          {illustrative
            ? "Illustrative fixture · not for sale"
            : "The collection"}
        </p>
        <h2>
          <a data-analytics-product-link="" href={`/gifts/${product.slug}`}>
            {product.punnyTitle || product.title}
          </a>
        </h2>
        <p>{product.wittyDescription || product.description}</p>
        <a data-analytics-product-link="" className="text-action" href={`/gifts/${product.slug}`}>
          {illustrative ? "Explore the example" : "View gift"}{" "}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}
