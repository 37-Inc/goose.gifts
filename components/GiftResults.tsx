'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { GiftIdea } from '@/lib/types';

interface GiftResultsProps {
  giftIdeas: GiftIdea[];
  permalinkUrl: string | null;
  onStartOver: () => void;
}

export function GiftResults({ giftIdeas, permalinkUrl, onStartOver }: GiftResultsProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = async () => {
    if (permalinkUrl) {
      await navigator.clipboard.writeText(permalinkUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header with share link */}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">
          🎉 Your Hilarious Gift Ideas Are Ready!
        </h2>

        {permalinkUrl && (
          <div className="flex flex-col sm:flex-row items-center gap-4 max-w-2xl mx-auto">
            <div className="flex-1 w-full">
              <input
                type="text"
                value={permalinkUrl}
                readOnly
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-sm"
              />
            </div>
            <button
              onClick={handleCopyLink}
              className="px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
            >
              {copiedLink ? '✓ Copied!' : '📋 Copy Link'}
            </button>
          </div>
        )}

        <button
          onClick={onStartOver}
          className="mt-4 mx-auto block text-purple-600 hover:text-purple-700 font-medium text-sm"
        >
          ← Start Over
        </button>
      </div>

      {/* Gift Ideas */}
      <div className="space-y-8">
        {giftIdeas.map((giftIdea) => (
          <div
            key={giftIdea.id}
            className="bg-white rounded-2xl shadow-xl overflow-hidden gift-card"
          >
            {/* Gift Idea Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 text-white">
              <h3 className="text-3xl font-bold mb-2">{giftIdea.title}</h3>
              <p className="text-lg italic opacity-90">{giftIdea.tagline}</p>
              <p className="mt-4 text-purple-100">{giftIdea.description}</p>
            </div>

            {/* Products */}
            <div className="p-6">
              <h4 className="text-lg font-semibold text-gray-700 mb-4">
                Bundle Includes:
              </h4>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {giftIdea.products.map((product) => (
                  <a
                    key={product.id}
                    href={product.affiliateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow group"
                  >
                    {/* Product Image */}
                    {product.imageUrl && (
                      <div className="relative w-full h-48 mb-3 bg-gray-100 rounded-lg overflow-hidden">
                        <Image
                          src={product.imageUrl}
                          alt={product.title}
                          fill
                          className="object-contain group-hover:scale-105 transition-transform"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>
                    )}

                    {/* Product Details */}
                    <h5 className="font-medium text-sm text-gray-800 mb-2 line-clamp-2 group-hover:text-purple-600 transition-colors">
                      {product.title}
                    </h5>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-purple-600">
                        {product.currency === 'USD' ? '$' : product.currency}
                        {product.price.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-500 uppercase">
                        {product.source}
                      </span>
                    </div>
                    {product.rating && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-gray-600">
                        <span>⭐</span>
                        <span>{product.rating.toFixed(1)}</span>
                        {product.reviewCount && (
                          <span className="text-gray-400">({product.reviewCount})</span>
                        )}
                      </div>
                    )}
                    <div className="mt-3 text-sm text-purple-600 font-medium group-hover:underline">
                      View on {product.source === 'amazon' ? 'Amazon' : 'Etsy'} →
                    </div>
                  </a>
                ))}
              </div>

              {/* Total Price */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-medium">Bundle Total:</span>
                  <span className="text-2xl font-bold text-gray-800">
                    ${giftIdea.products.reduce((sum, p) => sum + p.price, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-gray-700 text-center">
          <strong>Note:</strong> Prices are fetched in real-time and may vary. Click through to verify current pricing and availability.
        </p>
      </div>
    </div>
  );
}
