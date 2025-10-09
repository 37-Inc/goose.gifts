import { getNewestBundles } from '@/lib/db/related-bundles';
import { getTrendingProducts } from '@/lib/db/operations';
import { HomeClient } from '@/components/HomeClient';
import { RecentBundles } from '@/components/RecentBundles';
import { TrendingProducts } from '@/components/TrendingProducts';
import { SearchBar } from '@/components/SearchBar';

export const revalidate = 3600; // Revalidate every hour

export default async function HomePage() {
  // Fetch recent bundles and trending products for the homepage
  const recentBundles = await getNewestBundles(8);
  const trendingProducts = await getTrendingProducts(12);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-zinc-50/30 to-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-8 sm:pt-12 pb-8 sm:pb-10">
        <div className="text-center mb-8">
          {/* Logo + Title - inline with goose on left */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-6">
            <img
              src="/sillygoose.png"
              alt="goose.gifts"
              className="w-14 h-14 sm:w-16 sm:h-16 sm:translate-y-1 opacity-90"
            />
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tight text-zinc-900">
              goose.gifts
            </h1>
          </div>

          <p className="text-base sm:text-lg text-zinc-600 mb-2 font-light max-w-2xl mx-auto">
            Thoughtful gifts, effortlessly curated
          </p>
          <p className="text-sm text-zinc-500 max-w-xl mx-auto">
            AI-powered gift discovery
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-6">
          <SearchBar />
        </div>

        {/* Divider with "or" */}
        <div className="max-w-2xl mx-auto mb-6 flex items-center gap-4">
          <div className="flex-1 h-px bg-zinc-200"></div>
          <span className="text-xs text-zinc-400 font-light">or</span>
          <div className="flex-1 h-px bg-zinc-200"></div>
        </div>

        {/* Main Interactive Content - Client Component */}
        <HomeClient />
      </div>

      {/* Trending Products Section */}
      <TrendingProducts products={trendingProducts} />

      {/* Recent Bundles Section */}
      <RecentBundles bundles={recentBundles} />

      {/* How It Works Section */}
      <div className="container mx-auto px-4 py-20 max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-light text-zinc-900 mb-3">How it works</h2>
          <div className="h-px w-16 mx-auto bg-gradient-to-r from-transparent via-zinc-300 to-transparent"></div>
        </div>
        <div className="grid md:grid-cols-3 gap-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-zinc-100 text-zinc-600 text-sm font-light mb-4">01</div>
            <h3 className="text-base font-medium mb-2 text-zinc-900">Describe</h3>
            <p className="text-sm text-zinc-500 leading-relaxed font-light">
              Share their interests, personality, and the occasion
            </p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-zinc-100 text-zinc-600 text-sm font-light mb-4">02</div>
            <h3 className="text-base font-medium mb-2 text-zinc-900">Discover</h3>
            <p className="text-sm text-zinc-500 leading-relaxed font-light">
              AI curates thoughtful gift concepts with real products
            </p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-zinc-100 text-zinc-600 text-sm font-light mb-4">03</div>
            <h3 className="text-base font-medium mb-2 text-zinc-900">Gift</h3>
            <p className="text-sm text-zinc-500 leading-relaxed font-light">
              Browse curated bundles, ready to purchase or share
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-16 border-t border-zinc-100">
        <p className="text-xs text-zinc-400 font-light tracking-wide">
          Crafted with care
        </p>
      </div>
    </div>
  );
}
