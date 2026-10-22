import { notFound } from "next/navigation";
import { ProductImage } from "@/components/ProductImage";
import { buildGiftPageSchema } from "@/lib/gift-page-schema";
import { catalog } from "../../../lib/catalog";
import { isIllustrative } from "../../../lib/selection";
import { previewMetadata, PREVIEW_ORIGIN } from "../../../lib/metadata";
import { ProductCard } from "../../../components/ProductCard";
import { og } from "../../../lib/og-data";

export const dynamicParams = false;
// Held identities use shared neutral assets, not one React export per identity.
export function generateStaticParams() {
  return catalog.products.map(({ slug }) => ({
    slug,
  }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = catalog.products.find((item) => item.slug === slug);
  if (!product) notFound();
  return previewMetadata(
    product.title,
    product.description,
    `/gifts/${slug}`,
    { indexable: true, fixture: catalog.dataKind === "synthetic_fixture",
      image: og.cards.find((card) => card.subjectId === product.publicId) },
  );
}
export default async function Gift({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = catalog.products.find((item) => item.slug === slug);
  if (!product) notFound();
  const illustrative = isIllustrative(product);
  const retailer = product.source === "amazon" ? "Amazon" : "Etsy";
  const schema = buildGiftPageSchema(
    product,
    `${PREVIEW_ORIGIN}/gifts/${slug}`,
    product.title,
    product.description,
    PREVIEW_ORIGIN,
  );
  return (
    <main id="main" className="site-main">
      {!illustrative && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <a className="back-link" href="/gifts">
        ← The collection
      </a>
      <article className="product-detail">
        <div className={`detail-art${illustrative ? "" : " retailer-art"}`}>
          <ProductImage
            imageUrl={product.imageUrl}
            alt={
              illustrative
                ? `Original illustration of the fictional ${product.title}`
                : product.title
            }
            className="object-contain"
            sizes="(max-width: 700px) 90vw, 55vw"
            priority
          />
        </div>
        <div className="detail-copy">
          <p className="eyebrow">
            {illustrative
              ? "Illustrative fixture · not for sale"
              : "A carefully considered bad idea"}
          </p>
          <h1>{product.punnyTitle || product.title}</h1>
          <p className="detail-line">
            {product.wittyDescription || product.description}
          </p>
          {illustrative ? (
            <div className="fixture-explanation">
              <h2>A design example, not a real listing.</h2>
              <p>
                This original illustration and fictional object test the layout.
                There is no retailer, price, availability or endorsement to
                claim.
              </p>
              <a className="button" href="/random-gift">
                Try another example
              </a>
            </div>
          ) : (
            <div id="gift-retailer-primary"
              data-analytics-id={product.id}
              data-analytics-source={product.source}
              data-analytics-context="gift_page_primary_cta"
              data-analytics-expiry={product.eligibleUntil}>
              <a
                data-analytics-outbound=""
                href={product.affiliateUrl}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="button"
              >
                Check price on {retailer}
              </a>
              <p className="quiet">
                Check current price and availability at the retailer. We may
                earn a commission.
              </p>
            </div>
          )}
          {product.editorialWriteup && (
            <div className="editorial">
              <h2>The short version.</h2>
              {product.editorialWriteup
                .split(/\n\s*\n/)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
            </div>
          )}
          {!illustrative && product.punnyTitle && (
            <div className="listing-identity">
              <h2>Retailer listing name</h2>
              <p>{product.title}</p>
            </div>
          )}
        </div>
      </article>
      <section className="section-block">
        <div className="section-heading">
          <h2>While you’re considering it.</h2>
          <a href="/random-gift" className="text-action">
            Surprise me
          </a>
        </div>
        <div className="catalog-grid">
          {catalog.products
            .filter((item) => item.id !== product.id)
            .slice(0, 3)
            .map((item) => (
              <ProductCard key={item.id} product={item} context="gift_related" />
            ))}
        </div>
      </section>
    </main>
  );
}
