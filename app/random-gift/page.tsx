import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { PageHero, HeroUnderline } from '@/components/ui/PageHero';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ProductClickButton } from '@/components/ProductClickButton';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductImage } from '@/components/ProductImage';
import { getRandomGiftSelection, getProductById } from '@/lib/db/random-gift';
import { getSiteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

const PAGE_TITLE = 'Random Ridiculous Gift Generator';
const PAGE_DESCRIPTION = 'Spin through funny, weird, and actually purchasable gag gifts from the goose.gifts catalog.';
const DEFAULT_OG_IMAGE = {
  url: '/sillygoose-og.png',
  width: 1200,
  height: 630,
  alt: 'goose.gifts random ridiculous gift generator',
};

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// When a share link points at a specific gift (`?gift=<id>`), build a per-product
// share card: punny title + product image in the metadata, and a dynamic OG image
// rendered by /api/og/random-gift. `generateMetadata` (unlike `opengraph-image.tsx`)
// receives searchParams, so the query-param share URL keeps working unchanged.
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ gift?: string | string[]; spin?: string | string[] }>;
}): Promise<Metadata> {
  const params = searchParams ? await searchParams : {};
  const giftId = firstParam(params.gift);

  const product = giftId ? await getProductById(giftId).catch(() => undefined) : undefined;

  if (!product || !product.isActive) {
    return {
      title: `${PAGE_TITLE} | goose.gifts`,
      description: PAGE_DESCRIPTION,
      alternates: { canonical: '/random-gift' },
      openGraph: {
        title: `${PAGE_TITLE} | goose.gifts`,
        description: PAGE_DESCRIPTION,
        url: '/random-gift',
        siteName: 'goose.gifts',
        type: 'website',
        images: [DEFAULT_OG_IMAGE],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${PAGE_TITLE} | goose.gifts`,
        description: PAGE_DESCRIPTION,
        images: [DEFAULT_OG_IMAGE.url],
      },
    };
  }

  const productTitle = product.punnyTitle || product.title;
  const shareTitle = `${productTitle} · Random Ridiculous Gift | goose.gifts`;
  const shareDescription = product.wittyDescription || PAGE_DESCRIPTION;
  const ogImageUrl = `${getSiteUrl()}/api/og/random-gift?gift=${encodeURIComponent(product.id)}`;
  const ogImage = {
    url: ogImageUrl,
    width: 1200,
    height: 630,
    alt: `${productTitle} — a ridiculous gift from goose.gifts`,
  };

  return {
    title: shareTitle,
    description: shareDescription,
    // Keep every share variant canonicalizing to the base page (no duplicate content).
    alternates: { canonical: '/random-gift' },
    openGraph: {
      title: shareTitle,
      description: shareDescription,
      url: `/random-gift?gift=${encodeURIComponent(product.id)}`,
      siteName: 'goose.gifts',
      type: 'website',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description: shareDescription,
      images: [ogImageUrl],
    },
  };
}

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
      <main className="min-h-screen bg-white text-zinc-950">
        <Header />
        <PageHero
          title="The random gift machine is empty"
          subtitle="The catalog is temporarily missing eligible products. Try the full gift search instead."
        >
          <Link
            href="/"
            className="rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
          >
            Search gifts
          </Link>
        </PageHero>
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
    <main className="min-h-screen bg-white text-zinc-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
      <Header />

      <PageHero
        title={<>One <HeroUnderline>ridiculous</HeroUnderline> gift at a time</>}
        subtitle={`A fast spin through ${poolSize.toLocaleString('en-US')} catalog picks that passed the funny-gift relevance gate.`}
      >
        <Link
          href={`/random-gift?spin=${Date.now().toString(36)}`}
          className="rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
        >
          Another ridiculous gift
        </Link>
        <Link
          href={sharePath}
          className="rounded-full border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          Stable share link
        </Link>
      </PageHero>

      <section className="mx-auto max-w-4xl px-4 pt-10 sm:pt-12">
        <article className="grid gap-6 rounded-3xl bg-zinc-50 p-4 ring-1 ring-zinc-950/[0.06] sm:grid-cols-2 sm:p-6">
          <div className="relative aspect-square rounded-2xl bg-white ring-1 ring-zinc-950/[0.05]">
            <div className="absolute inset-5 sm:inset-6">
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
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
              <span className="text-sm font-semibold normal-case tracking-normal text-zinc-900">
                {formatPrice(product.price, product.currency)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{product.source === 'amazon' ? 'Amazon' : 'Etsy'}</span>
            </div>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-3xl">
              {title}
            </h2>
            {product.wittyDescription && (
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                {product.wittyDescription}
              </p>
            )}
            <ProductClickButton
              product={product}
              clickSource="random_gift"
              contextSlug="featured"
              className="mt-6 inline-flex w-fit rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
            >
              {product.price > 0 ? 'Get this gift' : 'Check price'}
            </ProductClickButton>
          </div>
        </article>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14">
        <SectionHeading
          title="Six more odd options"
          aside={
            <Link href="/gift-guides" className="font-semibold text-zinc-500 underline-offset-4 hover:text-red-600 hover:underline">
              Browse gift guides →
            </Link>
          }
        />
        <ProductGrid
          products={alternates}
          clickSource="random_gift"
          contextSlug="alternates"
        />
      </section>
    </main>
  );
}
