import { browse, isFixtureRelease } from "../../lib/catalog";
import { RandomSelection } from "../../components/RandomSelection";
import { previewMetadata } from "../../lib/metadata";
export const metadata = previewMetadata(
  "Leave it to chance",
  isFixtureRelease
    ? "A bounded versioned pool, no immediate repeats, and ordinary product links. Illustrative staging fixtures only."
    : "A bounded staging catalog pool, no immediate repeats, and ordinary product links. Not a public launch.",
  "/random-gift",
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
