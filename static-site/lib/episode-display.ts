import type { PublicCatalogProduct } from "../../lib/catalog/types";

export type EpisodeProduct = Pick<PublicCatalogProduct, "id" | "publicId" | "slug" | "source"
  | "title" | "punnyTitle" | "imageUrl" | "affiliateUrl" | "eligibleUntil">;
export interface DisplayEpisode {
  schemaVersion: 1;
  key: string;
  title: string;
  status: "draft" | "published";
  episodeDate: string | null;
  shareUrl: string | null;
  eligibleUntil: string | null;
  slots: Array<{
    position: number;
    originalPublicId: string | null;
    exactVariant: string | null;
    caption: string;
    primary: EpisodeProduct | null;
    alternatives: EpisodeProduct[];
  }>;
}
export function episodeProducts(episode: DisplayEpisode): EpisodeProduct[] {
  return episode.slots.flatMap((slot) => [
    ...(slot.primary ? [slot.primary] : []), ...slot.alternatives,
  ]);
}
/** Merchant-free fallback preserves the original manifest identity, never substitutes it. */
export function unavailableEpisode(episode: DisplayEpisode): DisplayEpisode {
  return {
    ...episode, eligibleUntil: null,
    slots: episode.slots.map((slot) => ({
      ...slot, primary: null, alternatives: [],
      caption: "The original selection is unavailable. Product content needs a fresh review.",
    })),
  };
}
