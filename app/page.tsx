import Image from 'next/image';
import Link from 'next/link';
import { getNewestBundles } from '@/lib/db/related-bundles';
import { getTrendingProducts } from '@/lib/db/operations';
import { HomeClient } from '@/components/HomeClient';
import { RecentBundles } from '@/components/RecentBundles';
import { TrendingProducts } from '@/components/TrendingProducts';
import { SearchBar } from '@/components/SearchBar';

export const revalidate = 3600; // Revalidate every hour

export default async function HomePage() {
  const recentBundles = await getNewestBundles(4);
  const trendingProducts = await getTrendingProducts(36);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
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

      <footer className="border-t border-zinc-200 bg-white px-4 py-10 text-center">
        <p className="text-xs leading-6 text-zinc-500">
          goose.gifts may earn a commission from qualifying affiliate purchases.
        </p>
      </footer>
    </main>
  );
}
