import { unstable_cache } from 'next/cache';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { products } from '@/lib/db/schema';
import { analyzeWeirdGiftCatalog } from '@/lib/weird-gift-index-analysis';

async function queryWeirdGiftIndex() {
  const rows = await db
    .select({
      title: products.title,
      price: products.price,
      source: products.source,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(
      eq(products.isActive, true),
      isNotNull(products.imageUrl),
      isNotNull(products.affiliateUrl)
    ));

  return analyzeWeirdGiftCatalog(rows);
}

export const getWeirdGiftIndex = unstable_cache(
  queryWeirdGiftIndex,
  ['weird-gift-index-2026-1'],
  {
    revalidate: 3600,
    tags: ['weird-gift-index'],
  }
);
