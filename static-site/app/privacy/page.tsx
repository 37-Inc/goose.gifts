import { previewMetadata } from "../../lib/metadata";
export const metadata = previewMetadata(
  "Preview privacy",
  "The isolated static proof does not initialize production analytics or save queries in browser storage.",
  "/privacy",
);
export default function Privacy() {
  return (
    <main id="main" className="site-main prose">
      <h1>Preview privacy.</h1>
      <p>
        This isolated staging proof does not initialize production analytics.
        Search queries are sent only to the site’s search endpoint when you
        submit them. We do not store catalog content or search queries in
        localStorage, cookies or a service worker.
      </p>
      <p>
        External retailer links, when enabled for approved real products, open
        only after you choose them. Illustrative fixtures have no retailer
        destination.
      </p>
      <p>
        Questions:{" "}
        <a href="mailto:goosegifts@37.technology">goosegifts@37.technology</a>.
      </p>
    </main>
  );
}
