import { createHash } from "node:crypto";
import type { CatalogSnapshot } from "../../lib/catalog/types";
import { giftGuides as guides } from "../../lib/gift-guide-definitions";
import { persistentPublicProduct } from "../../lib/catalog/display";

export interface OgIdentity { name: string; origin: string; tagline: string }
export interface OgCard {
  schemaVersion: 1;
  styleVersion: 1;
  identity: OgIdentity;
  kind: "brand" | "guide" | "product" | "fixture";
  subjectId: string;
  title: string;
  eligibleUntil: string | null;
}
// Stay inside the bundled font's basic Latin glyphs. No automatic CDN font/emoji
// loading, transcription or invented replacement copy for unsupported titles.
export function ogText(value: string): string | null {
  const text = value.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-").replace(/…/g, "...").trim();
  return text && /^[\x20-\x7e]+$/.test(text) ? text : null;
}
export function ogPath(card: OgCard): string {
  return `/og/${createHash("sha256").update(JSON.stringify(card)).digest("hex")}.png`;
}
function titleText(value: string) {
  const text = ogText(value);
  return text && text.length <= 180 && text.split(/\s+/).every((word) => word.length <= 32) ? text : null;
}
export function createBrandOg(identity: OgIdentity): OgCard {
  const url = new URL(identity.origin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || !ogText(identity.name) || identity.name.length > 80 || !ogText(identity.tagline) || identity.tagline.length > 160)
    throw new Error("Invalid approved OG identity");
  const approved = { name: ogText(identity.name)!, origin: url.origin, tagline: ogText(identity.tagline)! };
  return { schemaVersion: 1, styleVersion: 1, identity: approved, kind: "brand", subjectId: "brand",
    title: approved.tagline, eligibleUntil: null };
}
export function createOgRelease(snapshot: CatalogSnapshot, identity: OgIdentity) {
  const brand = createBrandOg(identity);
  const make = (kind: OgCard["kind"], subjectId: string, title: string, eligibleUntil: string | null): OgCard => ({
    ...brand, kind, subjectId, title, eligibleUntil,
  });
  const cards = [brand, ...guides.flatMap((guide) => {
    const title = titleText(guide.h1);
    return title ? [make("guide", guide.slug, title, null)] : [];
  })];
  for (const original of snapshot.products) {
    const product = persistentPublicProduct(original) ?? original;
    const title = titleText(product.punnyTitle || "") || titleText(product.title);
    if (title) cards.push(make(snapshot.dataKind === "synthetic_fixture" ? "fixture" : "product",
      product.publicId, title, product.eligibleUntil));
  }
  return { brand, cards, byPath: new Map(cards.map((card) => [ogPath(card), card])) };
}
