'use client';

import { useState } from 'react';
import Script from 'next/script';
import type { GiftIdea, GiftRequest } from '@/lib/types';
import { ProductCarousel } from './ProductCarousel';

interface GiftResultsProps {
  giftIdeas: GiftIdea[];
  permalinkUrl: string | null;
  searchRequest: GiftRequest | null;
  onStartOver: () => void;
}

export function GiftResults({ giftIdeas, permalinkUrl, searchRequest, onStartOver }: GiftResultsProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  // Track outbound link clicks with Google Analytics
  const handleOutboundClick = (url: string, e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    // Check if gtag is available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gtag = (window as any).gtag;

      const callback = function () {
        window.open(url, '_blank', 'noopener,noreferrer');
      };

      gtag('event', 'conversion_event_outbound_click', {
        'event_callback': callback,
        'event_timeout': 2000,
      });
    } else {
      // Fallback if gtag not available
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // Generate JSON-LD structured data for gift bundles
  const itemListSchema = searchRequest ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Gift Ideas for ${searchRequest.recipientDescription.slice(0, 100)}`,
    description: `AI-generated gift bundles: ${giftIdeas.map(g => g.title).join(', ')}`,
    numberOfItems: giftIdeas.length,
    itemListElement: giftIdeas.map((gift, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: gift.title,
        description: gift.tagline,
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'USD',
          lowPrice: Math.min(...gift.products.filter(p => p.price > 0).map(p => p.price)),
          highPrice: Math.max(...gift.products.filter(p => p.price > 0).map(p => p.price)),
          offerCount: gift.products.length,
        },
      },
    })),
  } : null;

  const handleCopyLink = async () => {
    if (permalinkUrl) {
      await navigator.clipboard.writeText(permalinkUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* JSON-LD Structured Data */}
      {itemListSchema && (
        <Script
          id="gift-results-schema"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      )}

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
                &quot;{giftIdea.tagline}&quot;
              </p>
              <p className="text-sm text-zinc-600 ml-11 leading-relaxed max-w-2xl">
                {giftIdea.description}
              </p>
            </div>

            {/* Products Carousel */}
            <ProductCarousel
              products={giftIdea.products}
              onProductClick={handleOutboundClick}
            />

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
