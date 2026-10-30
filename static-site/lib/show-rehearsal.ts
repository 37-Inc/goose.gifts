import type { CatalogSnapshot, PublicCatalogProduct } from "../../lib/catalog/types";
import { rankedBrowseProducts } from "./browse";

// A rehearsed assortment, not a claim that free-form input was matched by search.
// Resolve against the current public snapshot so links and images stay canonical.
export const SHOW_PICK_SLUGS = [
  "wiener-switch-light-up-your-night-with-laughter",
  "farting-ring-box-the-ring-that-will-crack-you-up",
  "cat-butt-bottle-opener-pawsitively-hilarious",
  "alligator-oven-mitt-take-a-bite-out-of-safety",
  "pickle-your-problems-away-mystic-pickle-fortune-teller",
  "shear-ly-the-best-toilet-roll-holder",
] as const;

// Short, factual copy for a quick on-camera reveal; no price or stock claims.
export const SHOW_PICK_COPY: Record<string, { title: string; description: string }> = {
  "wiener-switch-light-up-your-night-with-laughter": { title: "The wiener switch", description: "A bedside lamp with a very cheeky switch." },
  "farting-ring-box-the-ring-that-will-crack-you-up": { title: "The farting ring box", description: "An engagement-ring box with a surprise inside. Ring not included." },
  "cat-butt-bottle-opener-pawsitively-hilarious": { title: "Cat butt bottle opener", description: "Open a bottle from the business end of a cat." },
  "alligator-oven-mitt-take-a-bite-out-of-safety": { title: "Alligator oven mitt", description: "A hungry-looking helper for the kitchen." },
  "pickle-your-problems-away-mystic-pickle-fortune-teller": { title: "Fortune-telling pickle", description: "Ask it a yes-or-no question and press for an answer." },
  "shear-ly-the-best-toilet-roll-holder": { title: "Sheep toilet paper holders", description: "Three sheep that turn spare rolls into a flock." },
};

export function selectShowPicks(snapshot: CatalogSnapshot): PublicCatalogProduct[] {
  const ranked = rankedBrowseProducts(snapshot);
  const available = new Map(ranked.map((product) => [product.slug, product]));
  const picks = SHOW_PICK_SLUGS.flatMap((slug) => available.get(slug) || []);
  // Fixtures are illustrative. On a real catalog, never silently substitute
  // unrehearsed items if one of the hand-picked products is removed.
  return snapshot.dataKind === "synthetic_fixture" ? ranked.slice(0, 6) : picks;
}
