import type { PublicCatalogProduct } from '../../lib/catalog/types.ts';
import { isCatalogDisplayEligibleProduct, productDisplayTypeKey, scoreProductForTrending, suppressNearDuplicateProducts } from '../../lib/db/product-scoring.ts';

function seedHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** Ranking/family comparisons happen once per immutable Worker release, not per request. */
export function prepareStaticFeed(products: readonly PublicCatalogProduct[], at: number) {
  const ids = new Set<string>();
  const ranked = products.filter((product) => {
    if (ids.has(product.id) || !(Date.parse(product.eligibleUntil) > at) || !isCatalogDisplayEligibleProduct(product)) return false;
    ids.add(product.id);
    return true;
  }).map((product) => ({ product, title: product.title, score: scoreProductForTrending(product) }))
    .sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id));
  const pool = suppressNearDuplicateProducts(ranked).map(({ product }, rank) => ({ product, rank }));
  const members = new Set(pool.map(({ product }) => product.id));
  const until = pool.reduce((deadline, { product }) => Math.min(deadline, Date.parse(product.eligibleUntil)), Infinity);
  const queues = new Map<string, typeof pool>();
  for (const entry of pool) {
    const type = productDisplayTypeKey(entry.product.title) || '';
    if (!queues.has(type)) queues.set(type, []);
    queues.get(type)!.push(entry);
  }

  return {
    expiresAt: until,
    /** Caller bounds seed<=80, limit<=36 and exclusions<=1200. No per-seed state is retained. */
    select(seed: string, limit: number, excluded: ReadonlySet<string>, now: number) {
      if (!(until > now)) return null;
      let remaining = pool.length;
      for (const id of excluded) if (members.has(id)) remaining--;
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
          if (!excluded.has(entry.product.id)) { cursor.head = entry; return; }
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
