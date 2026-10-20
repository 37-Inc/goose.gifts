import drafts from "../../../../content/show/drafts.json";
import { validateEpisodeManifest } from "../../../../content/show/manifest";
import { catalog } from "../../../lib/catalog";
import { Presentation } from "../../../components/Presentation";
import { previewMetadata } from "../../../lib/metadata";
export const metadata = previewMetadata(
  "Presentation proof — unpublished draft",
  "A 720p keyboard-controlled presentation template. No products or show appearance confirmed.",
  "/preview/presentation",
);
export default function PresentationPreview() {
  const episodes = drafts.map((draft) =>
    validateEpisodeManifest(draft, catalog),
  );
  const episode = episodes[0];
  const ids = new Set(
    episode.slots.flatMap((slot) => [
      slot.productPublicId,
      ...slot.alternativePublicIds,
    ]),
  );
  return (
    <main id="main" className="presentation-main">
      <Presentation
        episode={episode}
        products={catalog.products.filter((product) =>
          ids.has(product.publicId),
        )}
      />
    </main>
  );
}
