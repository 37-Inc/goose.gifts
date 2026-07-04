import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getNewestBundles } from '@/lib/db/related-bundles';
import { getTrendingProducts } from '@/lib/db/operations';
import { HomeClient } from '@/components/HomeClient';
import { RecentBundles } from '@/components/RecentBundles';
import { TrendingProducts } from '@/components/TrendingProducts';
import { SearchBar } from '@/components/SearchBar';
import { giftGuides } from '@/lib/gift-guides';
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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://goose.gifts';

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

export default async function HomePage() {
  const recentBundles = await getNewestBundles(4);
  const trendingProducts = await getTrendingProducts(36);
  const itemListSchema = JSON.stringify(buildHomeItemListSchema(trendingProducts)).replace(/</g, '\\u003c');

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListSchema }}
      />

      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/sillygoose.png"
              alt="goose.gifts"
              width={48}
              height={48}
              className="h-12 w-12"
              priority
            />
            <span className="text-2xl font-black tracking-tight">goose.gifts</span>
          </Link>

          <div className="w-full sm:max-w-xl">
            <SearchBar placeholder="Search gag gifts, weird presents, white elephant ideas..." />
          </div>
        </div>
      </header>

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
          {giftGuides.map((guide) => (
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

      <TrendingProducts products={trendingProducts} />

      <section className="mx-auto max-w-5xl px-4 py-12" id="custom-bundle">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Still need a bundle?
          </p>
          <h2 className="mt-1 text-2xl font-bold text-zinc-950">
            Build a custom gift bundle
          </h2>
        </div>
        <HomeClient />
      </section>

      <RecentBundles bundles={recentBundles} />
    </main>
  );
}
