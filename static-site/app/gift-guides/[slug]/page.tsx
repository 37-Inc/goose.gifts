import { notFound } from "next/navigation";
import { guides } from "../../../lib/guides";
import { catalog, isFixtureRelease } from "../../../lib/catalog";
import { ProductCard } from "../../../components/ProductCard";
import { previewMetadata } from "../../../lib/metadata";
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
    guide?.label || "Gift guide",
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
  return (
    <main id="main" className="site-main">
      <a className="back-link" href="/gift-guides">
        ← Gift guides
      </a>
      <div className="page-heading">
        <p className="eyebrow">{guide.label}</p>
        <h1>{guide.title}</h1>
        <p>{guide.intro}</p>
      </div>
      <div className="editorial-intro">
        <h2>{guide.heading}</h2>
        <p>{guide.body}</p>
      </div>
      {isFixtureRelease ? (
        <>
          <p className="fixture-note">
            Layout examples only. The guide’s real product cohort is pending
            review; these fictional objects are not recommendations or listings.
          </p>
          <div className="catalog-grid">
            {catalog.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </>
      ) : (
        <div className="guide-pending">
          <h2>This guide’s selection is being reviewed.</h2>
          <p>
            The staging migration sample is not a guide-specific recommendation.
            We’ll add products here after their fit for this guide is confirmed.
          </p>
          <a className="text-action" href="/gifts">
            Browse the staging collection →
          </a>
        </div>
      )}
    </main>
  );
}
