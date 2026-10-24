import type { PublicCatalogProduct } from "../../lib/catalog/types";
import { shortProductName } from "./product-presentation";

const stem = (word: string) => /s$/.test(word) && !/(?:ss|us|is)$/.test(word) ? word.slice(0, -1) : word;
const generic = new Set("and the for with from your you this that gifts gift funny fun novelty hilarious unique weird quirky gag white elephant men women adults birthday christmas stocking stuffers present set pack inch inches original decor decoration small mini black green pink red blue printed premium holder".split(" ").map(stem));
const words = (text: string) => new Set((shortProductName(text).toLowerCase().match(/[a-z]{3,}/g) || [])
  .map(stem)
  .filter(word => !generic.has(word)));
const tags = (product: PublicCatalogProduct) => new Set((product.humorTags || []).filter(tag =>
  !["novelty", "weird", "funny", "gag", "white-elephant", "prank", "party", "quirky-gift"].includes(tag)));
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter(value => b.has(value)).length;

/** Built once per static snapshot; no database, vectors or per-visitor requests. */
export function createRelatedGiftSelector(products: readonly PublicCatalogProduct[]) {
  const entries = products.map(product => ({ product, words: words(product.title), tags: tags(product) }));
  return (product: PublicCatalogProduct, count = 3): PublicCatalogProduct[] => {
    const subject = { words: words(product.title), tags: tags(product) };
    return entries.filter(entry => entry.product.id !== product.id)
      .map(entry => ({ ...entry, score: overlap(subject.words, entry.words) * 2 + overlap(subject.tags, entry.tags) * 3 }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, count).map(entry => entry.product);
  };
}
