import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { ProductClickButton } from '@/components/ProductClickButton';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductImage } from '@/components/ProductImage';
import { getRandomGiftSelection } from '@/lib/db/random-gift';
import { getSiteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

const PAGE_TITLE = 'Random Ridiculous Gift Generator';
const PAGE_DESCRIPTION = 'Spin through funny, weird, and actually purchasable gag gifts from the goose.gifts catalog.';

export const metadata: Metadata = {
  title: `${PAGE_TITLE} | goose.gifts`,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: '/random-gift',
  },
  openGraph: {
    title: `${PAGE_TITLE} | goose.gifts`,
    description: PAGE_DESCRIPTION,
    url: '/random-gift',
    siteName: 'goose.gifts',
    type: 'website',
    images: [
      {
        url: '/sillygoose-og.png',
        width: 1200,
        height: 630,
        alt: 'goose.gifts random ridiculous gift generator',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${PAGE_TITLE} | goose.gifts`,
    description: PAGE_DESCRIPTION,
    images: ['/sillygoose-og.png'],
  },
};

function formatPrice(price: number, currency: string): string {
  if (price <= 0) {
    return 'Check price';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(price);
}

function displayTitle(product: { punnyTitle?: string; title: string }): string {
  return product.punnyTitle || product.title;
}

export default async function RandomGiftPage({
  searchParams,
}: {
  searchParams?: Promise<{ gift?: string | string[]; spin?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedId = Array.isArray(params.gift) ? params.gift[0] : params.gift;
  const spin = Array.isArray(params.spin) ? params.spin[0] : params.spin;
  const seed = spin || requestedId || new Date().toISOString().slice(0, 13);
  const { product, alternates, poolSize } = await getRandomGiftSelection(seed, requestedId);
  const baseUrl = getSiteUrl();

  if (!product) {
    return (
      <main className="min-h-screen bg-zinc-50 text-zinc-950">
        <Header />
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-4xl font-black tracking-tight">Random gift machine is empty.</h1>
          <p className="mt-4 text-zinc-600">
            The catalog is temporarily missing eligible products. Try the full gift search instead.
          </p>
          <Link href="/" className="mt-8 inline-flex rounded-lg bg-zinc-950 px-5 py-3 text-sm font-bold text-white hover:bg-red-700">
            Search gifts
          </Link>
        </section>
      </main>
    );
  }

  const title = displayTitle(product);
  const sharePath = `/random-gift?gift=${encodeURIComponent(product.id)}`;
  const shareUrl = `${baseUrl}${sharePath}`;
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${baseUrl}/random-gift#webpage`,
        name: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        url: `${baseUrl}/random-gift`,
        isPartOf: {
          '@id': `${baseUrl}/#website`,
        },
      },
      {
        '@type': 'Product',
        name: title,
        image: product.imageUrl,
        description: product.wittyDescription || product.sourceQuery || product.title,
        url: shareUrl,
        category: 'Gag gifts',
        offers: product.price > 0 ? {
          '@type': 'Offer',
          price: product.price.toFixed(2),
          priceCurrency: product.currency || 'USD',
          availability: 'https://schema.org/InStock',
          url: product.affiliateUrl,
        } : undefined,
      },
    ].filter(Boolean),
  }).replace(/</g, '\\u003c');

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
      <Header />

      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center lg:py-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">
              One weird pick at a time
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-zinc-950 sm:text-5xl">
              Random Ridiculous Gift Generator
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
              A fast spin through {poolSize.toLocaleString('en-US')} catalog picks that passed the funny-gift relevance gate.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={`/random-gift?spin=${Date.now().toString(36)}`}
                className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Another ridiculous gift
              </Link>
              <Link
                href={sharePath}
                className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:border-zinc-500"
              >
                Stable share link
              </Link>
            </div>
          </div>

          <article className="grid gap-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] sm:p-5">
            <div className="relative aspect-square rounded-lg border border-zinc-200 bg-white">
              <div className="absolute inset-4">
                <ProductImage
                  imageUrl={product.imageUrl}
                  alt={product.title}
                  className="object-contain"
                  sizes="(max-width: 768px) 90vw, 40vw"
                  priority
                />
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                <span>{formatPrice(product.price, product.currency)}</span>
                <span>{product.source === 'amazon' ? 'Amazon' : 'Etsy'}</span>
              </div>
              <h2 className="mt-3 text-2xl font-black leading-tight text-zinc-950 sm:text-3xl">
                {title}
              </h2>
              {product.wittyDescription && (
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  {product.wittyDescription}
                </p>
              )}
              <ProductClickButton
                product={product}
                clickSource="random_gift"
                contextSlug="featured"
                className="mt-6 inline-flex w-fit rounded-lg bg-red-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-zinc-950"
              >
                Check price
              </ProductClickButton>
            </div>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">
              Keep spinning
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-zinc-950">
              Six more odd options
            </h2>
          </div>
          <Link href="/gift-guides" className="text-sm font-bold text-red-700 hover:text-zinc-950">
            Browse gift guides
          </Link>
        </div>
        <ProductGrid
          products={alternates}
          clickSource="random_gift"
          contextSlug="alternates"
        />
      </section>
    </main>
  );
}
