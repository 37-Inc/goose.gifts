import type { CatalogSnapshot, PublicCatalogProduct } from '../../lib/catalog/types.ts';
import { catalogDeadline, persistentPublicProduct, resolvePublicProduct } from '../../lib/catalog/display.ts';
import { isCatalogDisplayEligibleProduct, productDisplayTypeKey, scoreProductForTrending, suppressNearDuplicateProducts } from '../../lib/db/product-scoring.ts';

function seedHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

// Stable serialized codes: 0=uncapped other; 1..7 retain the existing max4/type.
const TYPES = ['', 'mug', 'socks', 'sign', 'candle', 'shirt', 'hat', 'keychain'];
export interface StaticFeedPlan {
  schemaVersion: 1;
  catalogRevision: string;
  catalogSnapshotSha256: string;
  /** Base-ranked [snapshot product index, type code], without merchant content duplication. */
  entries: Array<[number, number]>;
}

/** Build only: never call ranking/family comparisons during isolate initialization. */
export function createStaticFeedPlan(snapshot: CatalogSnapshot, catalogSnapshotSha256: string, at = Date.parse(snapshot.generatedAt)): StaticFeedPlan {
  if (!/^[a-f0-9]{64}$/.test(catalogSnapshotSha256)) throw new Error('invalid_snapshot_digest');
  const asOf = new Date(at);
  if (!Number.isFinite(asOf.getTime())) throw new Error('invalid_snapshot_time');
  const ids = new Set<string>();
  const ranked = snapshot.products.flatMap((product, index) => {
    const resolved=persistentPublicProduct(product)??resolvePublicProduct(product,at);return resolved ? [{product:resolved,index}] : [];
  }).filter(({ product }) => {
    if (ids.has(product.id) || !(product.eligibleUntil===null
      ? product.isActive&&product.qualityScore>=0&&product.qualityScore<=1&&product.imageUrl&&product.affiliateUrl
      : isCatalogDisplayEligibleProduct(product, { asOf }))) return false;
    ids.add(product.id);
    return true;
  }).map(({ product, index }) => ({ product, index, title: product.title, score: scoreProductForTrending(product) }))
    .sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id));
  // Cleared listings have already passed exact catalog deduplication. Different
  // designs/brands must not disappear because they share a novelty archetype.
  const finite = new Set(suppressNearDuplicateProducts(ranked.filter(({ product }) => product.eligibleUntil !== null))
    .map(({ index }) => index));
  return {
    schemaVersion: 1, catalogRevision: snapshot.catalogRevision, catalogSnapshotSha256,
    entries: ranked.filter(({ product, index }) => product.eligibleUntil === null || finite.has(index)).map(({ product, index }) => {
      const type = TYPES.indexOf(productDisplayTypeKey(product.title) || '');
      if (type < 0) throw new Error('unsupported_feed_type');
      return [index, type];
    }),
  };
}

/** Validate a build-bound plan and construct queues without scoring or examining merchant titles. */
export function prepareStaticFeed(snapshot: CatalogSnapshot, input: unknown, expectedSnapshotSha256: string | undefined) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const plan = input as Partial<StaticFeedPlan>;
  if (plan.schemaVersion !== 1 || plan.catalogRevision !== snapshot.catalogRevision
    || !expectedSnapshotSha256 || !/^[a-f0-9]{64}$/.test(expectedSnapshotSha256)
    || plan.catalogSnapshotSha256 !== expectedSnapshotSha256 || !Array.isArray(plan.entries)
    || plan.entries.length > snapshot.products.length) return null;
  const pool: Array<{ product: PublicCatalogProduct; rank: number; type: number }> = [];
  const indices = new Set<number>();
  const members = new Map<string,number>();
  for (const entry of plan.entries) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [index, type] = entry;
    if (!Number.isInteger(index) || index < 0 || index >= snapshot.products.length || indices.has(index)
      || !Number.isInteger(type) || type < 0 || type >= TYPES.length) return null;
    const product = persistentPublicProduct(snapshot.products[index])??snapshot.products[index];
    if (members.has(product.id)) return null;
    indices.add(index);
    members.set(product.id,catalogDeadline(product.eligibleUntil));
    pool.push({ product, rank: pool.length, type });
  }
  // Include every original content deadline: an expired-all build cannot become success-empty.
  let until = Infinity;
  for (const product of snapshot.products) {
    const deadline = catalogDeadline(product.eligibleUntil);
    if (!Number.isFinite(deadline)&&deadline!==Infinity) return null;
    until = Math.min(until, deadline);
  }
  const queues = new Map<string, typeof pool>();
  for (const entry of pool) {
    const type = TYPES[entry.type];
    if (!queues.has(type)) queues.set(type, []);
    queues.get(type)!.push(entry);
  }
  const permanent=snapshot.products.some(product=>persistentPublicProduct(product)!==null);
  const deadlines=[...members.values()].filter(Number.isFinite).sort((a,b)=>a-b);

  return {
    expiresAt: until,
    /** Caller bounds seed<=80, limit<=36 and exclusions<=1200. No per-seed state is retained. */
    select(seed: string, limit: number, excluded: ReadonlySet<string>, now: number) {
      if(!permanent&&!(until>now))return null; // Legacy all-or-safe contract.
      let low=0,high=deadlines.length;
      while(low<high){const middle=(low+high)>>>1;if(deadlines[middle]<=now)low=middle+1;else high=middle;}
      let remaining = pool.length-low;
      if(pool.length&&!remaining)return null;
      for (const id of excluded) if ((members.get(id)??-Infinity)>now) remaining--;
      let inspected = 0;
      const cursors = [...queues].map(([type, entries]) => {
        // Rotate only the leading quality window; the remainder stays ranked.
        const window = Math.min(12, entries.length);
        return { type, entries, window, offset: seedHash(`${seed}:${type}`) % window, visited: 0, selected: 0, head: undefined as typeof pool[number] | undefined };
      });
      function advance(cursor: typeof cursors[number]) {
        cursor.head = undefined;
        if (cursor.type && cursor.selected >= 4) return;
        while (cursor.visited < cursor.entries.length) {
          const position = cursor.visited++;
          const entry = cursor.entries[position < cursor.window ? (position + cursor.offset) % cursor.window : position];
          inspected++;
          if (catalogDeadline(entry.product.eligibleUntil)>now&&!excluded.has(entry.product.id)) { cursor.head = entry; return; }
        }
      }
      for (const cursor of cursors) advance(cursor);
      const selected: PublicCatalogProduct[] = [];
      while (selected.length < limit) {
        let best: typeof cursors[number] | undefined;
        for (const cursor of cursors) if (cursor.head && (!best || cursor.head.rank < best.head!.rank)) best = cursor;
        if (!best) break;
        selected.push(best.head!.product);
        best.selected++;
        advance(best);
      }
      // Deferred type variants remain available on later requests with new exclusions.
      return { products: selected, hasMore: remaining > selected.length, inspected };
    },
  };
}
