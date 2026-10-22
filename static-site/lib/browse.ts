import { createHash } from "node:crypto";
import type { CatalogSnapshot } from "../../lib/catalog/types";
import { readySnapshotProducts, RANDOM_POOL_LIMIT } from "./selection";
import { projectCard } from "./card-shard";
import type { CardShard } from "./card-shard";
import { earliestCatalogExpiry } from "../../lib/catalog/display";

export const INITIAL_BROWSE_COUNT = 24;
export const FEED_SHARD_SIZE = 24;
export function createBrowseRelease(snapshot: CatalogSnapshot) {
  const cards = readySnapshotProducts(snapshot).map(projectCard);
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
