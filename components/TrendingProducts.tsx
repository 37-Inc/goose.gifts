'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import type { Product } from '@/lib/types';

interface TrendingProductsProps {
  products: Product[];
}

export function TrendingProducts({ products }: TrendingProductsProps) {
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300; // Scroll by ~1 product width
      const newScrollLeft = scrollContainerRef.current.scrollLeft +
        (direction === 'right' ? scrollAmount : -scrollAmount);

      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };

  if (products.length === 0) {
    return null;
  }

  const handleProductClick = (url: string, productId: string, e: React.MouseEvent) => {
    e.preventDefault();

    // Track click in database (fire-and-forget)
    fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, slug: 'trending' }),
    }).catch(() => {}); // Silently fail

    // Track with Google Analytics
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      const gtag = (window as any).gtag;
      gtag('event', 'conversion_event_outbound_click', {
        event_category: 'trending_product',
        event_label: url,
        link_domain: new URL(url).hostname,
        event_callback: () => window.open(url, '_blank', 'noopener,noreferrer'),
        event_timeout: 2000,
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 py-16 border-y border-orange-100">
      <div className="container mx-auto px-4">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              <span className="text-lg">⚡</span>
              <span>Trending Now</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-3">
              Most-Clicked Gift Products
            </h2>
            <p className="text-zinc-600 max-w-2xl mx-auto">
              Handpicked from our top-rated gift bundles. Premium products with high ratings and great reviews.
            </p>
          </div>

          {/* Products Carousel/Grid */}
          <div className="relative">
            {/* Scroll Arrows - Desktop Only */}
            <button
              onClick={() => scroll('left')}
              className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-12 h-12 items-center justify-center bg-white rounded-full shadow-xl hover:shadow-2xl hover:scale-110 transition-all duration-200 border-2 border-orange-200 hover:border-orange-400 group"
              aria-label="Scroll left"
            >
              <svg className="w-6 h-6 text-orange-600 group-hover:text-orange-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              onClick={() => scroll('right')}
              className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-12 h-12 items-center justify-center bg-white rounded-full shadow-xl hover:shadow-2xl hover:scale-110 transition-all duration-200 border-2 border-orange-200 hover:border-orange-400 group"
              aria-label="Scroll right"
            >
              <svg className="w-6 h-6 text-orange-600 group-hover:text-orange-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Desktop: Scrollable Row */}
            <div
              ref={scrollContainerRef}
              className="hidden lg:flex overflow-x-auto gap-6 pb-4 snap-x snap-mandatory scrollbar-hide"
            >
              {products.map((product) => (
                <a
                  key={product.id}
                  href={product.affiliateUrl}
                  onClick={(e) => handleProductClick(product.affiliateUrl, product.id, e)}
                  onMouseEnter={() => setHoveredProduct(product.id)}
                  onMouseLeave={() => setHoveredProduct(null)}
                  className="flex-none w-[280px] snap-start group"
                >
                  <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border border-zinc-100 h-full flex flex-col">
                    {/* Product Image */}
                    <div className="relative bg-zinc-50 overflow-hidden" style={{ aspectRatio: '1.91/1' }}>
                      {product.imageUrl && (
                        <Image
                          src={product.imageUrl}
                          alt={product.title}
                          fill
                          className={`object-contain p-4 transition-transform duration-300 ${
                            hoveredProduct === product.id ? 'scale-110' : 'scale-100'
                          }`}
                          sizes="280px"
                        />
                      )}
                      {/* Rating Badge */}
                      {product.rating && product.rating >= 4.0 && (
                        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-full shadow-lg">
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                              <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                            </svg>
                            <span className="text-sm font-semibold text-zinc-900">
                              {product.rating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="text-base font-semibold text-zinc-900 mb-3 line-clamp-2 min-h-[3rem] group-hover:text-orange-600 transition-colors">
                        {product.title}
                      </h3>

                      {/* Reviews */}
                      <div className="mt-auto">
                        {product.reviewCount && product.reviewCount > 0 && (
                          <p className="text-sm text-zinc-600 mb-4">
                            {product.reviewCount.toLocaleString()} reviews
                          </p>
                        )}

                        {/* CTA Button */}
                        <button className="w-full bg-gradient-to-r from-orange-600 to-amber-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-orange-700 hover:to-amber-700 transition-all duration-200 shadow-lg hover:shadow-xl group-hover:scale-105">
                          Shop Now →
                        </button>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {/* Mobile/Tablet: Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-6">
              {products.slice(0, 6).map((product) => (
                <a
                  key={product.id}
                  href={product.affiliateUrl}
                  onClick={(e) => handleProductClick(product.affiliateUrl, product.id, e)}
                  className="group"
                >
                  <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-zinc-100 h-full flex flex-col">
                    {/* Product Image */}
                    <div className="relative bg-zinc-50 overflow-hidden" style={{ aspectRatio: '1.91/1' }}>
                      {product.imageUrl && (
                        <Image
                          src={product.imageUrl}
                          alt={product.title}
                          fill
                          className="object-contain p-4 group-hover:scale-110 transition-transform duration-300"
                          sizes="(max-width: 640px) 100vw, 50vw"
                        />
                      )}
                      {product.rating && product.rating >= 4.0 && (
                        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-full shadow-lg">
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                              <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                            </svg>
                            <span className="text-sm font-semibold text-zinc-900">
                              {product.rating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="text-base font-semibold text-zinc-900 mb-3 line-clamp-2 min-h-[3rem] group-hover:text-orange-600 transition-colors">
                        {product.title}
                      </h3>

                      <div className="mt-auto">
                        {product.reviewCount && product.reviewCount > 0 && (
                          <p className="text-sm text-zinc-600 mb-4">
                            {product.reviewCount.toLocaleString()} reviews
                          </p>
                        )}

                        <button className="w-full bg-gradient-to-r from-orange-600 to-amber-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-orange-700 hover:to-amber-700 transition-all duration-200">
                          Shop Now →
                        </button>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
