'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { GiftIdea, GiftRequest } from '@/lib/types';

interface GiftResultsProps {
  giftIdeas: GiftIdea[];
  permalinkUrl: string | null;
  searchRequest: GiftRequest | null;
  onStartOver: () => void;
}

export function GiftResults({ giftIdeas, permalinkUrl, searchRequest, onStartOver }: GiftResultsProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = async () => {
    if (permalinkUrl) {
      await navigator.clipboard.writeText(permalinkUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-semibold text-zinc-900 mb-3">
          Your Gift Ideas
        </h2>
        {searchRequest && (
          <div className="max-w-2xl mx-auto">
            <p className="text-sm text-zinc-500 mb-1">
              Gift ideas for
            </p>
            <p className="text-base text-zinc-700 font-medium">
              {searchRequest.recipientDescription}
            </p>
            {searchRequest.occasion && (
              <p className="text-sm text-zinc-500 mt-1">
                {searchRequest.occasion}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Share Link */}
      {permalinkUrl && (
        <div className="max-w-2xl mx-auto mb-16">
          <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-zinc-200">
            <input
              type="text"
              value={permalinkUrl}
              readOnly
              className="flex-1 px-3 py-2 text-sm text-zinc-600 bg-transparent border-none focus:outline-none"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap"
            >
              {copiedLink ? 'Copied' : 'Copy Link'}
            </button>
          </div>
        </div>
      )}

      {/* Gift Ideas */}
      <div className="space-y-20">
        {giftIdeas.map((giftIdea, index) => (
          <div key={giftIdea.id} className="group">
            {/* Gift Header */}
            <div className="mb-10 max-w-3xl">
              <div className="flex items-baseline gap-4 mb-4">
                <span className="text-xs font-semibold text-zinc-400 tracking-widest">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="text-3xl font-bold text-zinc-900 tracking-tight">
                  {giftIdea.title}
                </h3>
              </div>
              <p className="text-lg text-zinc-500 italic ml-11 mb-4 font-light">
                "{giftIdea.tagline}"
              </p>
              <p className="text-sm text-zinc-600 ml-11 leading-relaxed max-w-2xl">
                {giftIdea.description}
              </p>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {giftIdea.products.map((product) => (
                <a
                  key={product.id}
                  href={product.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/product block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
                >
                  {/* Product Image */}
                  <div className="relative mb-4 bg-zinc-50 rounded-lg overflow-hidden" style={{ aspectRatio: '1.91/1' }}>
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={product.title}
                        fill
                        className="object-cover group-hover/product:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-300">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <h4 className="text-sm font-medium text-zinc-900 mb-3 line-clamp-2 min-h-[2.5rem]">
                    {product.title}
                  </h4>

                  <div className="flex items-baseline justify-between mb-1">
                    {product.price > 0 ? (
                      <span className="text-lg font-semibold text-zinc-900">
                        ${product.price.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-400">Price on site</span>
                    )}
                    <span className="text-xs text-zinc-400 uppercase tracking-wide">
                      {product.source}
                    </span>
                  </div>

                  {product.rating && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
                      <div className="flex items-center">
                        <svg className="w-3.5 h-3.5 text-amber-400 fill-current" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="ml-1">{product.rating.toFixed(1)}</span>
                      </div>
                      {product.reviewCount && (
                        <span className="text-zinc-400">({product.reviewCount.toLocaleString()})</span>
                      )}
                    </div>
                  )}
                </a>
              ))}
            </div>

            {/* Bundle Total */}
            {giftIdea.products.some(p => p.price > 0) && (
              <div className="mt-8 pt-6 border-t border-zinc-200">
                <div className="flex items-center justify-between max-w-xs ml-11">
                  <span className="text-sm text-zinc-600">Bundle total</span>
                  <span className="text-xl font-semibold text-zinc-900">
                    ${giftIdea.products.reduce((sum, p) => sum + p.price, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="mt-20 pt-12 border-t border-zinc-200 text-center">
        <button
          onClick={onStartOver}
          className="inline-flex items-center gap-2 px-6 py-3 bg-white text-zinc-900 font-medium text-sm rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Start Over
        </button>
      </div>

      {/* Disclaimer */}
      <div className="mt-8 max-w-2xl mx-auto">
        <p className="text-xs text-zinc-400 text-center leading-relaxed">
          Prices shown are estimates and may vary. Click through to verify current pricing and availability.
          As affiliates, we may earn from qualifying purchases.
        </p>
      </div>
    </div>
  );
}
