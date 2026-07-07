import type { Metadata } from 'next';
import Link from 'next/link';
import { getTrendingProducts } from '@/lib/db/operations';
import { searchCatalogProducts } from '@/lib/db/product-search';
import { CatalogSearchFeed } from '@/components/CatalogSearchFeed';
import { Header } from '@/components/Header';
import { getFeaturedGiftGuides } from '@/lib/gift-guides';
import { getSiteUrl } from '@/lib/site';
import type { Product } from '@/lib/types';

export const revalidate = 3600; // Revalidate every hour

const HOME_TITLE = 'Funny Gag Gifts, White Elephant Ideas, and Weird Presents';
const HOME_DESCRIPTION = 'Find funny gag gifts, white elephant ideas, novelty products, and weird presents from a fast catalog built for people who are hard to shop for.';

export const metadata: Metadata = {
  title: `${HOME_TITLE} | goose.gifts`,
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: `${HOME_TITLE} | goose.gifts`,
    description: HOME_DESCRIPTION,
    url: '/',
    siteName: 'goose.gifts',
    type: 'website',
    images: [
      {
        url: '/sillygoose-og.png',
        width: 1200,
        height: 630,
        alt: 'goose.gifts funny gag gift catalog',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${HOME_TITLE} | goose.gifts`,
    description: HOME_DESCRIPTION,
    images: ['/sillygoose-og.png'],
  },
};

function buildHomeItemListSchema(products: Product[]) {
  const baseUrl = getSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: baseUrl,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 24).map((product, index) => {
      const item: Record<string, unknown> = {
        '@type': 'Product',
        name: product.punnyTitle || product.title,
        image: product.imageUrl,
        description: product.wittyDescription || product.sourceQuery || product.title,
        category: 'Gag gifts',
        url: product.affiliateUrl,
      };

      if (product.price > 0) {
        item.offers = {
          '@type': 'Offer',
          price: product.price.toFixed(2),
          priceCurrency: product.currency || 'USD',
          availability: 'https://schema.org/InStock',
          url: product.affiliateUrl,
        };
      }

      if (product.rating && product.reviewCount) {
        item.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: product.rating.toFixed(1),
          reviewCount: product.reviewCount,
        };
      }

      return {
        '@type': 'ListItem',
        position: index + 1,
        item,
      };
    }),
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const initialQuery = (Array.isArray(params.q) ? params.q[0] || '' : params.q || '').trim();
  const initialProducts = initialQuery.length >= 2
    ? await searchCatalogProducts(initialQuery, 36)
    : await getTrendingProducts(36);
  const featuredGuides = getFeaturedGiftGuides(undefined, 20);
  const itemListSchema = JSON.stringify(buildHomeItemListSchema(initialProducts)).replace(/</g, '\\u003c');

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListSchema }}
      />

      <Header />

      <section className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
            Funny gifts, dumb ideas, real products
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-950 sm:text-5xl">
            The internet&apos;s least serious gift catalog.
          </h1>
          <p className="mt-3 text-base leading-7 text-zinc-600 sm:text-lg">
            Absurd, useful, and deeply unnecessary finds for people who are hard to shop for.
          </p>
        </div>

        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Gift guides">
          {featuredGuides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/gift-guides/${guide.slug}`}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-950"
            >
              {guide.title}
            </Link>
          ))}
        </nav>
      </section>

      <CatalogSearchFeed initialProducts={initialProducts} initialQuery={initialQuery} />
    </main>
  );
}
