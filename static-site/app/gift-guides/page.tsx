import { guides } from "../../lib/guides";
import { previewMetadata } from "../../lib/metadata";
export const metadata = previewMetadata(
  "Gift guides",
  "Two existing guide routes rendered without runtime database access. The real product selection remains under review.",
  "/gift-guides",
);
export default function Guides() {
  return (
    <main id="main" className="site-main">
      <div className="page-heading">
        <p className="eyebrow">A little direction</p>
        <h1>Know your audience.</h1>
        <p>Good bad ideas start with the person opening them.</p>
      </div>
      <div className="guide-links">
        {guides.map((guide, index) => (
          <a key={guide.slug} href={`/gift-guides/${guide.slug}`}>
            <span>0{index + 1}</span>
            {guide.title}
            <span>↗</span>
          </a>
        ))}
      </div>
    </main>
  );
}
