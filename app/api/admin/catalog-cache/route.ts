import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import {
  catalogCacheBearerToken,
  hasValidCatalogCacheSecret,
} from '@/lib/catalog-cache-auth';

export async function POST(request: NextRequest) {
  const token = catalogCacheBearerToken(request.headers.get('authorization'));
  if (!hasValidCatalogCacheSecret(token, process.env.CATALOG_CACHE_REVALIDATE_SECRET)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Catalog jobs are external writers: expire data before regenerating pages so
  // the first render cannot capture stale-while-revalidate results.
  revalidateTag('catalog-products', { expire: 0 });
  revalidateTag('gift-pages', { expire: 0 });
  revalidatePath('/gifts');
  revalidatePath('/gifts/[slug]', 'page');
  revalidatePath('/random-gift');
  revalidatePath('/sitemap.xml');

  return NextResponse.json({
    ok: true,
    revalidated: [
      'catalog-products',
      'gift-pages',
      '/gifts',
      '/gifts/[slug]',
      '/random-gift',
      '/sitemap.xml',
    ],
  });
}
