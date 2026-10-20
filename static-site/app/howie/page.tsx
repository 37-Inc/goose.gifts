import { previewMetadata } from "../../lib/metadata";
export const metadata = previewMetadata(
  "From the show",
  "No episode selection has been published. Confirmed products will appear here when ready.",
  "/howie",
);
export default function Howie() {
  return (
    <main id="main" className="site-main empty-state">
      <p className="eyebrow">From the show</p>
      <h1>Nothing to announce. Yet.</h1>
      <p>
        No episode selection has been published. When there is a confirmed
        selection, you’ll find the exact products here.
      </p>
      <a className="button" href="/gifts">
        Explore the collection ↗
      </a>
    </main>
  );
}
