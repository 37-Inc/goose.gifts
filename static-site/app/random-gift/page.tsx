import { browse, isFixtureRelease } from "../../lib/catalog";
import { RandomSelection } from "../../components/RandomSelection";
import { previewMetadata } from "../../lib/metadata";
import { isSitePreview } from "../../lib/site-identity";
export const metadata = previewMetadata(
  "Leave it to chance",
  isFixtureRelease
    ? "A bounded versioned pool, no immediate repeats, and ordinary product links. Illustrative staging fixtures only."
    : isSitePreview ? "A bounded staging catalog pool, no immediate repeats, and ordinary product links. Not a public launch."
      : "Choose from the curated collection, with no immediate repeats and links to each gift.",
  "/random-gift",
  { indexable: browse.random.poolSize > 0, fixture: isFixtureRelease },
);
export default function Random() {
  return (
    <main id="main" className="site-main">
      <div className="page-heading">
        <p className="eyebrow">An executive decision</p>
        <h1>Leave it to chance.</h1>
        <p>No quiz. No explanation required.</p>
      </div>
      <RandomSelection
        {...browse.random}
        catalogRevision={browse.catalogRevision}
        version={browse.version}
      />
    </main>
  );
}
