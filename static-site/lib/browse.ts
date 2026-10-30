import { createHash } from "node:crypto";
import type { CatalogSnapshot } from "../../lib/catalog/types";
import { readySnapshotProducts, RANDOM_POOL_LIMIT } from "./selection";
import { isCatalogDisplayEligibleProduct, limitProductTypeDiversity,
  scoreProductForFeed, suppressNearDuplicateProducts, areNearDuplicateTitles,
  productDisplayTypeKey } from "../../lib/db/product-scoring";
import homepage from "../../content/homepage.json";
import { projectCard } from "./card-shard";
import type { CardShard } from "./card-shard";
import { earliestCatalogExpiry } from "../../lib/catalog/display";

export const INITIAL_BROWSE_COUNT = 24;
export const FEED_SHARD_SIZE = 24;

/** Build-only ranking. Curate the first batch without dropping any gifts;
 * weaker matches/variants remain in subsequent static batches. */
export function rankedBrowseProducts(snapshot: CatalogSnapshot) {
  const seed = snapshot.generatedAt.slice(0, 10);
  const ranked = readySnapshotProducts(snapshot).map(product => ({ product,
    fit: isCatalogDisplayEligibleProduct(product, { asOf: new Date(snapshot.generatedAt) }),
    score: scoreProductForFeed(product, seed),
  })).sort((a, b) => Number(b.fit) - Number(a.fit) || b.score - a.score
    || a.product.id.localeCompare(b.product.id));
  const featured = homepage.featuredIds.flatMap(id => ranked.find(p => p.product.id === id)?.product || []);
  const featuredIds = new Set(featured.map(p => p.id));
  const opening = [...featured, ...limitProductTypeDiversity(
    suppressNearDuplicateProducts(ranked.filter(p => p.fit && !featuredIds.has(p.product.id)).map(p => p.product), 96),
    INITIAL_BROWSE_COUNT - featured.length, 2)];
  const selected = new Set(opening.map(p => p.id));
  return [...opening, ...ranked.filter(p => !selected.has(p.product.id)).map(p => p.product)];
}

/** Stable Pacific calendar keys, derived from a sealed release time, never a visitor clock. */
export function merchandisingEpoch(generatedAt: string) {
  const date = new Date(generatedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== generatedAt)
    throw new Error("Invalid merchandising release time");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  const ordinal = Date.parse(`${day}T00:00:00.000Z`) / 86400000;
  return { day, week: Math.floor((ordinal - 4) / 7) }; // January 5, 1970 was a Monday.
}

function seededFraction(seed: string, id: string) {
  const hash = createHash("sha256").update(`${seed}:${id}`).digest();
  return (hash.readUInt32BE(0) + 1) / 4294967297;
}

/** Supplier "funny gift" keywords alone do not make printed commodities a
 * compelling lead object. This stricter presentation pool never hides records. */
export function isHomepageRotationCandidate(product: ReturnType<typeof rankedBrowseProducts>[number], asOf: Date) {
  if (!isCatalogDisplayEligibleProduct(product, { asOf })) return false;
  const title = product.title.toLowerCase().replace(/[-–—]/g, " ");
  if (/\b(?:books?|coloring|notebooks?|journals?|shirts?|sweatshirts?|bodysuits?|aprons?|towels?|stickers?|decals?|napkins?|throw pillow|pillow covers?|pillow cases?|mouse pads?|phone cases?|greeting cards?|wall art|posters?|plaques?|tapestr(?:y|ies)|shower curtains?|wine glasses|bathroom signs?|sleep(?:ing)? masks?)\b/.test(title)) return false;
  if (/\b(?:socks?|hats?|caps?)\b/.test(title) && !/\b(?:chicken (?:leg|feet)|animal paw)\b/.test(title)) return false;
  if (/\b(?:mugs?|coffee cups?|tea cups?)\b/.test(title) && !/\b(?:toilet|3d|3 d|shark|sculpted|shaped)\b/.test(title)) return false;
  if (/\bplush\b/.test(title) && !/\b(?:ugly|fat|screaming|poop|chicken|pickle|emotional support|flower.*bouquet)\b/.test(title)) return false;
  if (/\b(?:stress (?:cube|ball)|fidget)\b/.test(title) && !/\b(?:poop|penis|testicle|chicken|pickle)\b/.test(title)) return false;
  return /\b(?:statue|figurine|sculpture|plush|puppet|decanter|oven mitt|spoon rest|bottle opener|night light|lamp|desk toy|sound machine|button|fortune teller|rubber chicken|yodeling|fart|farts|farting|poop|penis|testicle|shart|whoopee|belly (?:bag|fanny pack)|prank (?:gift )?box|gag (?:gift )?box|emergency box|jar|toilet|chicken (?:leg|feet)|animal paw)\b/.test(title);
}

function homepageType(title: string) {
  const text = title.toLowerCase();
  if (/\b(?:poop|poo|farts?|farting|shart|whoopee)\b/.test(text)) return "bodily-gag";
  if (/\b(?:button|sound machine)\b/.test(text)) return "sound-button";
  if (/\b(?:prank|gag) (?:gift )?box\b/.test(text)) return "prank-box";
  if (/\bplush\b/.test(text)) return "plush";
  if (/\bdecanter\b/.test(text)) return "decanter";
  if (/\btoilet paper\b/.test(text)) return "toilet-paper";
  return productDisplayTypeKey(title);
}

/** Presentation only: six weekly anchors, then daily quality-filtered discovery.
 * Keep related-gift ranking and the refresh operator's featured registry unchanged.
 */
export function merchandisedBrowseProducts(snapshot: CatalogSnapshot, generatedAt = snapshot.generatedAt) {
  const base = rankedBrowseProducts(snapshot), epoch = merchandisingEpoch(generatedAt);
  const available = new Map(base.map((product) => [product.id, product]));
  const anchorPool = homepage.featuredIds.flatMap((id) => available.get(id) || []);
  const offset = anchorPool.length ? (6 * epoch.week) % anchorPool.length : 0;
  const chosen: typeof base = [];
  const add = (product: typeof base[number], diverse: boolean, limit = INITIAL_BROWSE_COUNT) => {
    if (chosen.length >= limit || chosen.some((item) => item.id === product.id
      || areNearDuplicateTitles(item.title, product.title))) return;
    const type = homepageType(product.title);
    if (diverse && type && chosen.filter((item) => homepageType(item.title) === type).length >= 2) return;
    chosen.push(product);
  };
  for (const product of [...anchorPool.slice(offset), ...anchorPool.slice(0, offset)]) add(product, true, 6);
  const anchors = [...chosen], anchorIds = new Set(anchors.map((product) => product.id));
  const ranked = base.filter((product) => !anchorIds.has(product.id)
    && isHomepageRotationCandidate(product, new Date(generatedAt)))
    .map((product) => ({ product,
      // A deterministic weighted shuffle gives already-qualified objects a real
      // chance to rotate without treating supplier SEO or clicks as conversion proof.
      score: -Math.log(seededFraction(epoch.day, product.id))
        / (1 + scoreProductForFeed(product, epoch.day) / 100) }))
    .sort((a, b) => a.score - b.score || a.product.id.localeCompare(b.product.id))
    .map((entry) => entry.product);
  for (const product of ranked) add(product, true);
  // A small cohort should remain useful, but missing candidates never bypass
  // identity/expiry eligibility. Broader catalog products remain in the tail.
  for (const product of [...ranked, ...base]) add(product, false);
  const selected = new Set(chosen.map((product) => product.id));
  const rotations = chosen.filter((product) => !anchorIds.has(product.id));
  const slots = new Set([0, 1, 4, 8, 13, 19]);
  const opening = Array.from({ length: chosen.length }, (_, index) =>
    slots.has(index) && anchors.length ? anchors.shift()! : rotations.shift() || anchors.shift()!);
  return [...opening, ...base.filter((product) => !selected.has(product.id))];
}

export function createBrowseRelease(snapshot: CatalogSnapshot, generatedAt = snapshot.generatedAt) {
  const cards = merchandisedBrowseProducts(snapshot, generatedAt).map(projectCard);
  const version = createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: 1,
        initialBrowseCount: INITIAL_BROWSE_COUNT,
        feedShardSize: FEED_SHARD_SIZE,
        randomPoolLimit: RANDOM_POOL_LIMIT,
        catalogRevision: snapshot.catalogRevision,
        cards,
      }),
    )
    .digest("hex");
  const base = `/catalog/${version}`;
  const shard = (
    kind: CardShard["kind"],
    products: typeof cards,
    path: string,
    next: string | null = null,
  ) => {
    const eligibleUntil = earliestCatalogExpiry(products);
    const payload = products.length
      ? {
          schemaVersion: 1 as const,
          status: "ready" as const,
          catalogRevision: snapshot.catalogRevision,
          version,
          kind,
          eligibleUntil,
          products,
          next,
        }
      : {
          schemaVersion: 1 as const,
          status: "unavailable" as const,
          catalogRevision: snapshot.catalogRevision,
          version,
          kind,
          eligibleUntil: null,
          products: [],
          next: null,
        };
    return { path, eligibleUntil, payload };
  };
  const remaining = cards.slice(INITIAL_BROWSE_COUNT);
  const feedCount = Math.ceil(remaining.length / FEED_SHARD_SIZE);
  const feedPath = (index: number) => `${base}/feed-${index + 1}.json`;
  const feed = Array.from({ length: feedCount }, (_, index) =>
    shard(
      "feed",
      remaining.slice(index * FEED_SHARD_SIZE, (index + 1) * FEED_SHARD_SIZE),
      feedPath(index),
      index + 1 < feedCount ? feedPath(index + 1) : null,
    ),
  );
  const random = shard(
    "random",
    cards.slice(0, RANDOM_POOL_LIMIT),
    `${base}/random.json`,
  );
  return {
    catalogRevision: snapshot.catalogRevision,
    version,
    opening: cards.slice(0, 3),
    feed: {
      initial: cards.slice(3, INITIAL_BROWSE_COUNT),
      next: feed[0]?.path || null,
    },
    random: {
      initial: cards[0],
      poolSize: random.payload.products.length,
      poolPath: random.path,
    },
    shards: [...feed, random],
  };
}
