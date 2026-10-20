import { ProductImage } from "@/components/ProductImage";
import type { PublicCatalogProduct } from "../../lib/catalog/types";
import { isIllustrative } from "../lib/selection";

export function ProductCard({
  product,
  lead = false,
}: {
  product: PublicCatalogProduct;
  lead?: boolean;
}) {
  return (
    <article className={`product-card ${lead ? "lead-card" : ""}`}>
      <a
        className="product-art"
        href={`/gifts/${product.slug}`}
        aria-label={`View ${product.title}`}
      >
        <ProductImage
          imageUrl={product.imageUrl}
          alt={
            isIllustrative(product)
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
          {isIllustrative(product)
            ? "Illustrative fixture · not for sale"
            : "The collection"}
        </p>
        <h2>
          <a href={`/gifts/${product.slug}`}>
            {product.punnyTitle || product.title}
          </a>
        </h2>
        <p>{product.wittyDescription || product.description}</p>
        <a className="text-action" href={`/gifts/${product.slug}`}>
          {isIllustrative(product) ? "Explore the example" : "View gift"}{" "}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}
