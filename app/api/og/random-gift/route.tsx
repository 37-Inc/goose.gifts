import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { getProductById } from '@/lib/db/random-gift';
import type { Product } from '@/lib/types';

export const runtime = 'nodejs';

const SIZE = { width: 1200, height: 630 };

// Cache generated cards hard at the edge — the punny title + product image for a
// given id are effectively immutable, and share crawlers hit this repeatedly.
const CACHE_HEADERS = {
  'Cache-Control': 'public, immutable, no-transform, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
};

function displayTitle(product: Product): string {
  return product.punnyTitle || product.title;
}

// Pull the product image down ourselves and inline it as a data URI. Letting
// Satori fetch the remote URL means one slow/blocked retailer image fails the
// whole card; fetching here lets us fall back to a text-only branded card.
async function toDataUri(imageUrl: string): Promise<string | null> {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; goose.gifts OG bot)' },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > 5_000_000) {
      return null;
    }

    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function BrandFooter() {
  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: '#09090b', letterSpacing: -1 }}>
          goose.gifts
        </div>
        <div style={{ display: 'flex', height: 6, width: 132, background: '#dc2626', borderRadius: 9999, marginTop: 4 }} />
      </div>
    </div>
  );
}

function Fallback() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          background: '#ffffff',
          color: '#09090b',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
          padding: '72px 80px',
          width: '100%',
        }}
      >
        <div style={{ color: '#dc2626', display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
          Random Ridiculous Gift
        </div>
        <div style={{ display: 'flex', fontSize: 88, fontWeight: 900, letterSpacing: -4, lineHeight: 1, marginTop: 24, textAlign: 'center' }}>
          Weird gifts, one spin at a time
        </div>
        <div style={{ alignItems: 'center', display: 'flex', flexDirection: 'column', marginTop: 40 }}>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 800 }}>goose.gifts</div>
          <div style={{ display: 'flex', height: 7, width: 150, background: '#dc2626', borderRadius: 9999, marginTop: 6 }} />
        </div>
      </div>
    ),
    { ...SIZE, headers: CACHE_HEADERS }
  );
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('gift');

  if (!id) {
    return Fallback();
  }

  let product: Product | undefined;
  try {
    product = await getProductById(id);
  } catch {
    return Fallback();
  }

  if (!product || !product.isActive) {
    return Fallback();
  }

  const title = displayTitle(product);
  const tagline = product.wittyDescription || product.sourceQuery || 'A gag gift worth sharing.';
  const retailer = product.source === 'amazon' ? 'Amazon' : 'Etsy';
  const imageData = product.imageUrl ? await toDataUri(product.imageUrl) : null;

  return new ImageResponse(
    (
      <div
        style={{
          background: '#ffffff',
          color: '#09090b',
          display: 'flex',
          height: '100%',
          width: '100%',
        }}
      >
        {/* Product image tile */}
        <div
          style={{
            alignItems: 'center',
            background: '#fafafa',
            borderRight: '1px solid #f4f4f5',
            display: 'flex',
            justifyContent: 'center',
            padding: 56,
            width: 520,
          }}
        >
          {imageData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageData}
              alt=""
              width={408}
              height={408}
              style={{ objectFit: 'contain', borderRadius: 24 }}
            />
          ) : (
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                fontSize: 120,
                justifyContent: 'center',
              }}
            >
              🎁
            </div>
          )}
        </div>

        {/* Text column */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '64px 60px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
              <div style={{ color: '#dc2626', display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
                Random Ridiculous Gift
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: title.length > 48 ? 52 : 64,
                fontWeight: 900,
                letterSpacing: -2,
                lineHeight: 1.02,
                marginTop: 22,
              }}
            >
              {title.length > 90 ? `${title.slice(0, 88)}…` : title}
            </div>
            <div
              style={{
                color: '#71717a',
                display: 'flex',
                fontSize: 28,
                lineHeight: 1.3,
                marginTop: 22,
              }}
            >
              {tagline.length > 120 ? `${tagline.slice(0, 118)}…` : tagline}
            </div>
          </div>

          <div style={{ alignItems: 'flex-end', display: 'flex', justifyContent: 'space-between' }}>
            <BrandFooter />
            <div style={{ color: '#a1a1aa', display: 'flex', fontSize: 22, fontWeight: 600 }}>
              on {retailer}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...SIZE, headers: CACHE_HEADERS }
  );
}
