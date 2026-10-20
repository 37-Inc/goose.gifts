import drafts from "../../content/show/drafts.json";
import published from "../../content/show/published.json";
import { publishedEpisodes, validateEpisodeManifest } from "../../content/show/manifest";
import type { EpisodeManifest } from "../../content/show/manifest";
import type { CatalogSnapshot, PublicCatalogProduct } from "../../lib/catalog/types";
import { episodeProducts } from "./episode-display";
import type { DisplayEpisode, EpisodeProduct } from "./episode-display";

export function episodePath(key: string) { return `/howie/${key}`; }
export function episodeShareUrl(episode: EpisodeManifest): string | null {
  if (episode.status !== "published") return null;
  const url = new URL(episodePath(episode.key), "https://stupid.gifts");
  url.searchParams.set("utm_source", "howie_mandel_does_stuff");
  url.searchParams.set("utm_medium", "podcast");
  url.searchParams.set("utm_campaign", `episode_${episode.episodeDate!.replaceAll("-", "_")}`);
  return url.href;
}
function displayProduct(product: PublicCatalogProduct): EpisodeProduct {
  const { id, publicId, slug, source, title, punnyTitle, imageUrl, affiliateUrl, eligibleUntil } = product;
  return { id, publicId, slug, source, title, ...(punnyTitle ? { punnyTitle } : {}), imageUrl, affiliateUrl, eligibleUntil };
}
export function displayEpisode(episode: EpisodeManifest, snapshot: CatalogSnapshot): DisplayEpisode {
  const ready = new Map(snapshot.products.map((p) => [p.publicId, p]));
  const value: DisplayEpisode = {
    schemaVersion: 1, key: episode.key, title: episode.title,
    status: episode.status, episodeDate: episode.episodeDate,
    shareUrl: episodeShareUrl(episode), eligibleUntil: null,
    slots: episode.slots.map((slot) => {
      if (episode.status === "draft" && !episode.presentationAssetsApproved)
        return { position: slot.position, originalPublicId: null, exactVariant: null,
          caption: "Selection pending product and presentation approval.", primary: null, alternatives: [] };
      const primary = slot.productPublicId && ready.get(slot.productPublicId);
      return {
        position: slot.position, originalPublicId: slot.productPublicId,
        exactVariant: slot.exactVariant, caption: slot.caption,
        primary: primary ? displayProduct(primary) : null,
        alternatives: primary ? [] : slot.alternativePublicIds.flatMap((id) => {
          const product = ready.get(id);
          return product ? [displayProduct(product)] : [];
        }),
      };
    }),
  };
  value.eligibleUntil = episodeProducts(value).map((p) => p.eligibleUntil).sort()[0] || null;
  return value;
}
/** One tracked editorial source; private approvals/unused fields never enter display props. */
export function createShowRelease(snapshot: CatalogSnapshot, inputs: unknown[] = [...drafts, ...published]) {
  const manifests = inputs.map((input) => validateEpisodeManifest(input, snapshot));
  if (new Set(manifests.map((episode) => episode.key)).size !== manifests.length)
    throw new Error("Duplicate episode key");
  const episodes = publishedEpisodes(manifests).map((episode) => displayEpisode(episode, snapshot));
  const draft = manifests.find((episode) => episode.status === "draft");
  return { episodes, latest: episodes[0] || null,
    preview: draft ? displayEpisode(draft, snapshot) : null };
}
