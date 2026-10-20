import { notFound } from "next/navigation";
import {
  guides,
  selectGuideProducts,
  relatedGuides,
  guideSchema,
} from "../../../lib/guides";
import { catalog, isFixtureRelease } from "../../../lib/catalog";
import { ProductCard } from "../../../components/ProductCard";
import { previewMetadata } from "../../../lib/metadata";
import { JsonLd } from "../../../components/JsonLd";
export const dynamicParams = false;
export function generateStaticParams() {
  return guides.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = guides.find((item) => item.slug === slug);
  return previewMetadata(
    guide?.metadataTitle || guide?.title || "Gift guide",
    guide?.intro || "Selection under review.",
    `/gift-guides/${slug}`,
  );
}
export default async function Guide({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = guides.find((item) => item.slug === slug);
  if (!guide) notFound();
  const products = selectGuideProducts(catalog, guide);
  return (
    <main id="main" className="site-main guide-detail">
      <JsonLd data={guideSchema(guide, products)} />
      <a className="back-link" href="/gift-guides">
        ← Gift guides
      </a>
      <div className="page-heading">
        <p className="eyebrow">Gift guides</p>
        <h1>{guide.h1}</h1>
        <p>{guide.intro}</p>
      </div>
      <section
        className="guide-selection"
        aria-labelledby="guide-selection-heading"
      >
        <div className="section-heading">
          <h2 id="guide-selection-heading">
            Catalog matches in this snapshot.
          </h2>
          <span className="quiet">
            {products.length}{" "}
            {products.length === 1 ? "selection" : "selections"}
          </span>
        </div>
        {isFixtureRelease && (
          <p className="fixture-note">
            Illustrative release only. Fictional examples are not product
            recommendations.
          </p>
        )}
        {products.length ? (
          <div className="catalog-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} context={`gift_guide:${slug}`} />
            ))}
          </div>
        ) : (
          <div className="guide-pending">
            <p>
              No matching ready products in this snapshot. We have not filled
              this guide with unrelated gifts.
            </p>
            <a className="text-action" href="/gifts">
              Browse the staging collection →
            </a>
          </div>
        )}
      </section>
      {Boolean(guide.editorialSections?.length) && (
        <section className="guide-editorial section-block">
          <div className="section-heading">
            <h2>
              {guide.editorialHeading || "Choose the joke before the product"}
            </h2>
            {guide.editorialAside && (
              <span className="quiet">{guide.editorialAside}</span>
            )}
          </div>
          <div className="guide-editorial-grid">
            {guide.editorialSections?.map((section) => (
              <article key={section.title}>
                <h3>{section.title}</h3>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.links?.map((link) => (
                  <a
                    className="text-action"
                    key={link.slug}
                    href={`/gift-guides/${link.slug}`}
                  >
                    {link.label} →
                  </a>
                ))}
              </article>
            ))}
          </div>
        </section>
      )}
      {Boolean(guide.faqs?.length) && (
        <section className="guide-faq section-block">
          <h2>What to know before picking one.</h2>
          {guide.faqs?.map((faq) => (
            <article key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </section>
      )}
      <section className="section-block">
        <h2>Keep browsing.</h2>
        <div className="related-guide-links">
          {relatedGuides(guide).map((item) => (
            <a key={item.slug} href={`/gift-guides/${item.slug}`}>
              {item.title} →
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
