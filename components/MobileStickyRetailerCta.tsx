'use client';

import { useEffect, useState } from 'react';
import type { Product } from '@/lib/types';
import { ProductClickButton } from './ProductClickButton';

interface MobileStickyRetailerCtaProps {
  product: Product;
  contextSlug: string;
  retailerLabel: string;
}

const PRIMARY_CTA_ID = 'gift-retailer-primary';
const EDITORIAL_CTA_ID = 'gift-retailer-editorial';

function isInViewport(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

export function MobileStickyRetailerCta({
  product,
  contextSlug,
  retailerLabel,
}: MobileStickyRetailerCtaProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      const primaryCta = document.getElementById(PRIMARY_CTA_ID);
      const editorialCta = document.getElementById(EDITORIAL_CTA_ID);
      const footer = document.querySelector('footer');
      const primaryHasPassed = primaryCta
        ? primaryCta.getBoundingClientRect().bottom < 0
        : false;

      setIsVisible(
        primaryHasPassed
        && !isInViewport(editorialCta)
        && !isInViewport(footer)
      );
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);

    return () => {
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <aside
      aria-label={`View this gift at ${retailerLabel}`}
      className="fixed inset-x-3 z-40 rounded-2xl border border-zinc-950/10 bg-white/95 p-2.5 shadow-[0_16px_45px_-14px_rgba(0,0,0,0.35)] backdrop-blur sm:hidden"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 pl-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Current listing
          </p>
          <p className="truncate text-sm font-semibold text-zinc-900">
            {retailerLabel}
          </p>
        </div>
        <ProductClickButton
          product={product}
          clickSource="gift_page_sticky"
          contextSlug={contextSlug}
          ariaLabel={`See this gift at ${retailerLabel} (opens in a new tab)`}
          trackImpression={false}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white outline-none transition hover:bg-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          See at {retailerLabel}
          <span aria-hidden="true" className="ml-1.5">↗</span>
        </ProductClickButton>
      </div>
    </aside>
  );
}
