import { show } from "../../../lib/show-data";
import { Presentation } from "../../../components/Presentation";
import { previewMetadata } from "../../../lib/metadata";
export const metadata = previewMetadata(
  "Presentation proof — unpublished draft",
  "An unpublished presentation template. Only explicitly cleared selections can be displayed; no appearance is implied.",
  "/preview/presentation",
);
export default function PresentationPreview() {
  const episode = show.preview;
  if (!episode) return <main id="main" className="site-main empty-state"><h1>No draft presentation.</h1></main>;
  return (
    <main id="main" className="presentation-main">
      <Presentation episode={episode} />
    </main>
  );
}
