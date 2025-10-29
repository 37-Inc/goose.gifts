'use client';

import Link from 'next/link';
import type { GiftBundle } from '@/lib/db/schema';
import type { GiftIdea } from '@/lib/types';
import { BundleImage } from './BundleImage';

interface RecentBundlesProps {
  bundles: Array<GiftBundle & { giftIdeas: GiftIdea[] }>;
}

export function RecentBundles({ bundles }: RecentBundlesProps) {
  if (bundles.length === 0) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-24">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-3">
            Recent Gift Bundles
          </h2>
          <p className="text-zinc-600 max-w-2xl mx-auto">
            Fresh gift ideas from the community. Get inspired or create your own!
          </p>
        </div>

        {/* Bundles Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {bundles.map((bundle) => {
            const createdDate = new Date(bundle.createdAt);
            const timeAgo = getTimeAgo(createdDate);

            // Collect first product image from each gift idea (up to 4)
            const productImages = bundle.giftIdeas
              .slice(0, 4)
              .map(idea => idea.products?.[0]?.imageUrl)
              .filter(Boolean) as string[];

            return (
              <Link
                key={bundle.id}
                href={`/${bundle.slug}`}
                className="group block bg-white rounded-2xl overflow-hidden shadow-sm border border-zinc-100 transition-all duration-300 active:scale-[0.98] [@media(hover:hover)]:hover:shadow-xl [@media(hover:hover)]:hover:-translate-y-1"
              >
                {/* Bundle Image Grid */}
                {productImages.length > 0 && (
                  <BundleImage
                    images={productImages}
                    alt={bundle.seoTitle || bundle.giftIdeas[0]?.title || 'Gift bundle'}
                  />
                )}

                {/* Content */}
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-zinc-900 mb-2 line-clamp-2 [@media(hover:hover)]:group-hover:text-[#f59e42] transition-colors">
                    {bundle.seoTitle || bundle.giftIdeas[0]?.title}
                  </h3>
                  <p className="text-sm text-zinc-600 line-clamp-2 mb-3">
                    {bundle.seoDescription || bundle.recipientDescription}
                  </p>

                  {/* Metadata */}
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{timeAgo}</span>
                    {bundle.viewCount > 0 && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        {bundle.viewCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <p className="text-sm text-zinc-500 mb-4">
            Want to see your gift ideas here?
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white font-medium text-sm rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Create Your Bundle
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper function to format time ago
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / 60000);
  const diffInHours = Math.floor(diffInMs / 3600000);
  const diffInDays = Math.floor(diffInMs / 86400000);

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 30) return `${diffInDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
