import type { Metadata } from 'next';
import { getCatalogFeedProducts } from '@/lib/db/operations';
import { searchCatalogProducts } from '@/lib/db/product-search';
import { CatalogSearchFeed } from '@/components/CatalogSearchFeed';
import { Header } from '@/components/Header';
import { getFeaturedGiftGuides } from '@/lib/gift-guides';
import { buildHomeItemListSchema } from '@/lib/home-item-list-schema';
import { getSiteUrl } from '@/lib/site';

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

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const initialQuery = (Array.isArray(params.q) ? params.q[0] || '' : params.q || '').trim();
  const feedSeed = `home-${new Date().toISOString().slice(0, 10)}`;
  const initialProducts = initialQuery.length >= 2
    ? await searchCatalogProducts(initialQuery, 36)
    : (await getCatalogFeedProducts({ seed: feedSeed, limit: 36 })).products;
  const featuredGuides = getFeaturedGiftGuides(undefined, 6)
    .map(({ slug, title }) => ({ slug, title }));
  const itemList = buildHomeItemListSchema(initialProducts, getSiteUrl());
  const itemListSchema = itemList.numberOfItems > 0
    ? JSON.stringify(itemList).replace(/</g, '\\u003c')
    : null;

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      {itemListSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: itemListSchema }}
        />
      ) : null}

      <Header />

      <section className="mx-auto max-w-2xl px-4 pb-2 pt-10 text-center sm:pt-14">
        <h1 className="text-balance text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-[2.75rem] sm:leading-[1.15]">
          The internet&apos;s{' '}
          <span className="relative inline-block whitespace-nowrap">
            least serious
            <svg
              className="absolute -bottom-1.5 left-0 w-full text-red-500 sm:-bottom-2"
              viewBox="0 0 220 12"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M3 8.5C40 3.5 80 3 110 5.5C145 8.5 180 8 217 4"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </span>{' '}
          gift catalog
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-7 text-zinc-500 sm:text-lg">
          Absurd, useful, and deeply unnecessary finds for people who are hard to shop for.
        </p>
      </section>

      <CatalogSearchFeed
        initialProducts={initialProducts}
        initialQuery={initialQuery}
        feedSeed={feedSeed}
        featuredGuides={featuredGuides}
      />
    </main>
  );
}
