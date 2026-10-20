import { guides } from "../../lib/guides";
import { previewMetadata } from "../../lib/metadata";
import { PREVIEW_ORIGIN } from "../../lib/metadata";
import { JsonLd } from "../../components/JsonLd";
export const metadata = previewMetadata(
  "Gift guides",
  "Every existing guide, with original editorial and snapshot-only product matches. No runtime database access.",
  "/gift-guides",
);
export default function Guides() {
  return (
    <main id="main" className="site-main">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Gift guides",
          url: `${PREVIEW_ORIGIN}/gift-guides`,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: guides.length,
            itemListElement: guides.map((guide, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: guide.title,
              url: `${PREVIEW_ORIGIN}/gift-guides/${guide.slug}`,
            })),
          },
        }}
      />
      <div className="page-heading">
        <p className="eyebrow">A little direction</p>
        <h1>Know your audience.</h1>
        <p>
          Good bad ideas start with the person opening them. Browse all{" "}
          {guides.length} guides.
        </p>
      </div>
      <div className="guide-links">
        {guides.map((guide, index) => (
          <a key={guide.slug} href={`/gift-guides/${guide.slug}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {guide.title}
            <span>↗</span>
          </a>
        ))}
      </div>
    </main>
  );
}
