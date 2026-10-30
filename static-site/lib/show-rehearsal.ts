import type { CatalogSnapshot, PublicCatalogProduct } from "../../lib/catalog/types";
import { rankedBrowseProducts } from "./browse";

// A rehearsed assortment, not a claim that free-form input was matched by search.
// Resolve against the current public snapshot so links and images stay canonical.
export const SHOW_PICK_SLUGS = [
  "poop-tastic-mini-poop-the-gift-that-really-stinks",
  "poultry-in-motion-the-raw-chicken-vase-surprise",
  "farting-ring-box-the-ring-that-will-crack-you-up",
  "screaming-goat-desk-toy-hilarious-companion",
  "pickle-your-problems-away-mystic-pickle-fortune-teller",
  "shear-ly-the-best-toilet-roll-holder",
  "cat-butt-bottle-opener-pawsitively-hilarious",
] as const;

// A separate opening set keeps the rehearsed reveal fresh, regardless of the
// normal homepage's rotating assortment. These are not extra reveal picks.
export const SHOW_OPENING_SLUGS = [
  "grumpy-frog-not-happy-but-here-to-stay",
  "whiskey-duck-decanter-quack-pour-perfection",
  "medieval-cat-tastic-tapestry-a-purrfectly-quirky-decor",
  "spider-prank-box-a-hauntingly-good-time",
  "cluck-yeah-chicken-leg-socks-for-poultry-lovers",
  "toilet-mug-perfect-for-liquid-assets",
] as const;

// Short, factual copy for a quick on-camera reveal; no price or stock claims.
export const SHOW_PICK_COPY: Record<string, { title: string; description: string }> = {
  "poop-tastic-mini-poop-the-gift-that-really-stinks": { title: "Mini poop", description: "A tiny smiling poop." },
  "poultry-in-motion-the-raw-chicken-vase-surprise": { title: "Raw chicken vase", description: "A ceramic vase shaped like an uncooked chicken." },
  "farting-ring-box-the-ring-that-will-crack-you-up": { title: "The farting ring box", description: "An engagement-ring box that farts when opened. Ring not included." },
  "screaming-goat-desk-toy-hilarious-companion": { title: "Screaming goat", description: "A little goat that makes a big noise." },
  "cat-butt-bottle-opener-pawsitively-hilarious": { title: "Cat butt bottle opener", description: "Open a bottle from the business end of a cat." },
  "pickle-your-problems-away-mystic-pickle-fortune-teller": { title: "Fortune-telling pickle", description: "Ask it a yes-or-no question and press for an answer." },
  "shear-ly-the-best-toilet-roll-holder": { title: "Sheep toilet paper holders", description: "Three sheep that turn spare rolls into a flock." },
};

const OPENING_COUNT = SHOW_OPENING_SLUGS.length;
export function selectShowOpening(snapshot: CatalogSnapshot): PublicCatalogProduct[] {
  const ranked = rankedBrowseProducts(snapshot);
  if (snapshot.dataKind === "synthetic_fixture") return ranked.slice(0, OPENING_COUNT);
  const available = new Map(ranked.map((product) => [product.slug, product]));
  return SHOW_OPENING_SLUGS.flatMap((slug) => available.get(slug) || []);
}

export function selectShowPicks(snapshot: CatalogSnapshot): PublicCatalogProduct[] {
  const ranked = rankedBrowseProducts(snapshot);
  const available = new Map(ranked.map((product) => [product.slug, product]));
  const picks = SHOW_PICK_SLUGS.flatMap((slug) => available.get(slug) || []);
  // Fixtures are illustrative. On a real catalog, never silently substitute
  // unrehearsed items if one of the hand-picked products is removed.
  return snapshot.dataKind === "synthetic_fixture" ? ranked.slice(OPENING_COUNT, OPENING_COUNT + SHOW_PICK_SLUGS.length) : picks;
}
