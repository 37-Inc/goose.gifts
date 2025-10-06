'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import type { Product } from '@/lib/types';

interface ProductCarouselProps {
  products: Product[];
  bundleSlug?: string;
}

export function ProductCarousel({ products, bundleSlug }: ProductCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Track outbound link clicks with Google Analytics and database
  const handleProductClick = (url: string, productId: string, e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    // Track click in database (fire-and-forget)
    if (bundleSlug) {
      fetch('/api/track-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: bundleSlug, productId }),
      }).catch(() => {
        // Silently fail - don't block the user
      });
    }

    // Track with Google Analytics
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
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const checkScrollButtons = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    );
  };

  useEffect(() => {
    checkScrollButtons();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollButtons);
      return () => container.removeEventListener('scroll', checkScrollButtons);
    }
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const cardWidth = container.querySelector('.product-card')?.clientWidth || 0;
    const gap = 24; // gap-6 = 24px
    const scrollAmount = (cardWidth + gap) * 2; // Scroll 2 cards at a time

    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (products.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      {/* Left Arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-10 h-10 bg-white rounded-full shadow-lg border border-zinc-200 flex items-center justify-center hover:bg-zinc-50 hover:border-orange-500 transition-all duration-200 group"
          aria-label="Scroll left"
        >
          <svg
            className="w-5 h-5 text-zinc-600 group-hover:text-orange-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Right Arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-10 h-10 bg-white rounded-full shadow-lg border border-zinc-200 flex items-center justify-center hover:bg-zinc-50 hover:border-orange-500 transition-all duration-200 group"
          aria-label="Scroll right"
        >
          <svg
            className="w-5 h-5 text-zinc-600 group-hover:text-orange-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Scrollable Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {products.map((product) => (
          <a
            key={product.id}
            href={product.affiliateUrl}
            onClick={(e) => handleProductClick(product.affiliateUrl, product.id, e)}
            target="_blank"
            rel="noopener noreferrer"
            className="product-card flex-shrink-0 snap-start w-[calc(50%-12px)] sm:w-[calc(40%-12px)] lg:w-[calc(33.333%-16px)] bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
          >
            {/* Product Image */}
            <div className="relative mb-4 bg-zinc-50 rounded-lg overflow-hidden" style={{ aspectRatio: '1.91/1' }}>
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 40vw, 33vw"
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

      {/* Hide scrollbar with CSS */}
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
