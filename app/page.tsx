import { getNewestBundles } from '@/lib/db/related-bundles';
import { getTrendingProducts } from '@/lib/db/operations';
import { HomeClient } from '@/components/HomeClient';
import { RecentBundles } from '@/components/RecentBundles';
import { TrendingProducts } from '@/components/TrendingProducts';

export const revalidate = 3600; // Revalidate every hour

export default async function HomePage() {
  // Fetch recent bundles and trending products for the homepage
  const recentBundles = await getNewestBundles(8);
  const trendingProducts = await getTrendingProducts(12);

  return (
    <div className="min-h-screen warm-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 sm:py-24">
        <div className="text-center mb-16">
          {/* Logo + Title - stacked on mobile, inline on desktop */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mb-6">
            <img
              src="/sillygoose.png"
              alt="Silly Goose"
              className="w-24 h-24 sm:w-32 sm:h-32 sm:translate-y-3"
            />
            <h1 className="text-6xl sm:text-8xl font-bold tracking-tight text-zinc-900">
              goose.gifts
            </h1>
          </div>
          <p className="text-lg sm:text-xl text-zinc-600 mb-3 font-medium">
            Gift like a silly goose!
          </p>
          <p className="text-zinc-500 max-w-2xl mx-auto text-sm sm:text-base">
            Smart, funny gift ideas in seconds. Tell us about them, we&apos;ll find the perfect&nbsp;match.
          </p>
        </div>

        {/* Main Interactive Content - Client Component */}
        <HomeClient />
      </div>

      {/* Trending Products Section */}
      <TrendingProducts products={trendingProducts} />

      {/* Recent Bundles Section */}
      <RecentBundles bundles={recentBundles} />

      {/* How It Works Section */}
      <div className="container mx-auto px-4 py-24 max-w-2xl">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <div className="text-zinc-900 text-sm font-semibold mb-2">01</div>
            <h3 className="text-lg font-semibold mb-2 text-zinc-900">Describe</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Tell us about them - interests, personality, the occasion
            </p>
          </div>
          <div>
            <div className="text-zinc-900 text-sm font-semibold mb-2">02</div>
            <h3 className="text-lg font-semibold mb-2 text-zinc-900">Generate</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              AI creates clever gift concepts with real products
            </p>
          </div>
          <div>
            <div className="text-zinc-900 text-sm font-semibold mb-2">03</div>
            <h3 className="text-lg font-semibold mb-2 text-zinc-900">Share</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Get curated bundles with links, ready to buy or share
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-12">
        <p className="text-xs text-zinc-400">
          Made with 🪿 by silly humans
        </p>
      </div>
    </div>
  );
}
