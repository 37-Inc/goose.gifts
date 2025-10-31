'use client';

import { useState, useRef, useEffect } from 'react';
import type { Product } from '@/lib/types';
import { ProductImage } from './ProductImage';

interface TrendingProductsProps {
  products: Product[];
}

export function TrendingProducts({ products }: TrendingProductsProps) {
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [impressionsTracked, setImpressionsTracked] = useState(false);

  // Check scroll position and update arrow visibility
  const updateScrollButtons = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10); // 10px threshold
    }
  };

  useEffect(() => {
    updateScrollButtons();
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', updateScrollButtons);
      window.addEventListener('resize', updateScrollButtons);

      return () => {
        scrollContainer.removeEventListener('scroll', updateScrollButtons);
        window.removeEventListener('resize', updateScrollButtons);
      };
    }
  }, [products]);

  // Track impressions when products are shown
  useEffect(() => {
    if (!impressionsTracked && products.length > 0) {
      setImpressionsTracked(true);

      // Track impressions for all products shown (fire-and-forget)
      fetch('/api/track-impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: products.map(p => p.id)
        }),
      }).catch(() => {}); // Silently fail
    }
  }, [products, impressionsTracked]);

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
      body: JSON.stringify({ productId, source: 'trending' }),
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
    <div className="relative bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 py-12 border-y border-orange-100 overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}></div>

      <div className="container mx-auto px-4 relative">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-semibold mb-4 shadow-lg">
              <span className="text-lg">⚡</span>
              <span>Trending Now</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-2">
              Trending Products
            </h2>
            <p className="text-zinc-600 max-w-2xl mx-auto text-sm sm:text-base">
              See what everyone's clicking on. Top-rated gifts with amazing reviews.
            </p>
          </div>

          {/* Products Carousel/Grid */}
          <div className="relative">
            {/* Mobile: Scroll Arrows */}
            {canScrollLeft && (
              <button
                onClick={() => scroll('left')}
                className="lg:hidden absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-200 border-2 border-orange-200 hover:border-orange-400 group"
                aria-label="Scroll left"
              >
                <svg className="w-5 h-5 text-orange-600 group-hover:text-orange-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {canScrollRight && (
              <button
                onClick={() => scroll('right')}
                className="lg:hidden absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-200 border-2 border-orange-200 hover:border-orange-400 group"
                aria-label="Scroll right"
              >
                <svg className="w-5 h-5 text-orange-600 group-hover:text-orange-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {/* Desktop: 2-Row Grid (All 12 Products Visible) */}
            <div className="hidden lg:grid grid-cols-6 gap-5">
              {products.map((product) => (
                <a
                  key={product.id}
                  href={product.affiliateUrl}
                  onClick={(e) => handleProductClick(product.affiliateUrl, product.id, e)}
                  onMouseEnter={() => setHoveredProduct(product.id)}
                  onMouseLeave={() => setHoveredProduct(null)}
                  className="group"
                >
                  <div className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border border-orange-100/50 h-full flex flex-col relative">
                    {/* Shine effect on hover */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 group-hover:via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                    {/* Product Image */}
                    <div className="relative bg-zinc-50 overflow-hidden" style={{ aspectRatio: '1/1' }}>
                      {product.imageUrl && (
                        <ProductImage
                          imageUrl={product.imageUrl}
                          alt={product.title}
                          className={`object-cover scale-110 transition-transform duration-300 ${
                            hoveredProduct === product.id ? 'scale-125' : 'scale-110'
                          }`}
                          sizes="280px"
                        />
                      )}
                      {/* Rating Badge */}
                      {product.rating && product.rating >= 4.0 && (
                        <div className="absolute top-2 right-2 bg-gradient-to-br from-yellow-400 to-orange-400 text-white px-2 py-1 rounded-lg shadow-lg">
                          <div className="flex items-center gap-1">
                            <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20">
                              <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                            </svg>
                            <span className="text-xs font-bold">
                              {product.rating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-3 pb-4 flex-1 flex flex-col min-h-[120px]">
                      <div className="h-[3.75rem] overflow-hidden mb-2">
                        <h3 className="text-sm font-semibold text-zinc-900 line-clamp-2 group-hover:text-orange-600 transition-colors leading-relaxed">
                          {product.title}
                        </h3>
                      </div>

                      <div className="mt-auto space-y-1">
                        {/* Reviews - Mock data for display */}
                        <div className="flex items-center gap-1">
                          <div className="flex">
                            {[...Array(5)].map((_, i) => {
                              // Generate consistent mock rating based on product ID
                              const mockRating = 4 + (parseInt(product.id.slice(-1), 36) % 2) * 0.5;
                              return (
                                <svg key={i} className={`w-3 h-3 ${i < Math.floor(mockRating) ? 'text-yellow-400' : 'text-gray-300'} fill-current`} viewBox="0 0 20 20">
                                  <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                                </svg>
                              );
                            })}
                          </div>
                          <span className="text-xs text-zinc-500">
                            ({(product.reviewCount || (327 + (parseInt(product.id.slice(-3), 36) % 147) * 23)).toLocaleString()})
                          </span>
                        </div>

                        {/* View on Source */}
                        <div className="text-[11px] font-medium text-orange-600 group-hover:text-orange-700">
                          View on {product.source === 'amazon' ? 'Amazon' : 'Etsy'} →
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {/* Mobile/Tablet: Horizontal Scroll */}
            <div
              ref={scrollContainerRef}
              className="lg:hidden flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory scrollbar-hide px-1"
            >
              {products.map((product) => (
                <a
                  key={product.id}
                  href={product.affiliateUrl}
                  onClick={(e) => handleProductClick(product.affiliateUrl, product.id, e)}
                  className="flex-none w-[60vw] sm:w-[40vw] snap-start group"
                >
                  <div className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-orange-100/50 h-full flex flex-col relative">
                    {/* Shine effect on hover */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 group-hover:via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                    {/* Product Image */}
                    <div className="relative bg-zinc-50 overflow-hidden" style={{ aspectRatio: '1/1' }}>
                      {product.imageUrl && (
                        <ProductImage
                          imageUrl={product.imageUrl}
                          alt={product.title}
                          className="object-cover scale-110 group-hover:scale-125 transition-transform duration-300"
                          sizes="(max-width: 640px) 50vw, 33vw"
                        />
                      )}
                      {product.rating && product.rating >= 4.0 && (
                        <div className="absolute top-2 right-2 bg-gradient-to-br from-yellow-400 to-orange-400 text-white px-2 py-1 rounded-lg shadow-lg">
                          <div className="flex items-center gap-1">
                            <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20">
                              <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                            </svg>
                            <span className="text-xs font-bold">
                              {product.rating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-3 pb-4 flex-1 flex flex-col min-h-[120px]">
                      <div className="h-[3.75rem] overflow-hidden mb-2">
                        <h3 className="text-sm font-semibold text-zinc-900 line-clamp-2 group-hover:text-orange-600 transition-colors leading-relaxed">
                          {product.title}
                        </h3>
                      </div>

                      <div className="mt-auto space-y-1">
                        {/* Reviews - Mock data for display */}
                        <div className="flex items-center gap-1">
                          <div className="flex">
                            {[...Array(5)].map((_, i) => {
                              // Generate consistent mock rating based on product ID
                              const mockRating = 4 + (parseInt(product.id.slice(-1), 36) % 2) * 0.5;
                              return (
                                <svg key={i} className={`w-3 h-3 ${i < Math.floor(mockRating) ? 'text-yellow-400' : 'text-gray-300'} fill-current`} viewBox="0 0 20 20">
                                  <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                                </svg>
                              );
                            })}
                          </div>
                          <span className="text-xs text-zinc-500">
                            ({(product.reviewCount || (327 + (parseInt(product.id.slice(-3), 36) % 147) * 23)).toLocaleString()})
                          </span>
                        </div>

                        {/* View on Source */}
                        <div className="text-[11px] font-medium text-orange-600 group-hover:text-orange-700">
                          View on {product.source === 'amazon' ? 'Amazon' : 'Etsy'} →
                        </div>
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
