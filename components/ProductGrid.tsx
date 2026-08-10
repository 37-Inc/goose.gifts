'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Product } from '@/lib/types';
import {
  captureOutboundProductClick,
  captureSelectItem,
  captureViewItemList,
} from '@/lib/client-analytics';
import { getClickAttribution } from '@/lib/client-attribution';
import { isPurchasableAvailability } from '@/lib/gift-slugs';
import { ProductImage } from './ProductImage';

interface ProductGridProps {
  products: Product[];
  clickSource: string;
  contextSlug?: string;
  searchQueryId?: string | null;
}

function formatPrice(product: Product): string {
  if (product.price <= 0) {
    return 'Check price';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency || 'USD',
  }).format(product.price);
}

function hasFreshProductPrice(product: Product): boolean {
  const checkedAt = product.availabilityCheckedAt
    ? new Date(product.availabilityCheckedAt).getTime()
    : Number.NaN;
  return product.price > 0
    && isPurchasableAvailability(product.availabilityStatus)
    && Number.isFinite(checkedAt)
    && Date.now() - checkedAt <= 60 * 60 * 1000;
}

function getDisplayTitle(product: Product): string {
  return product.punnyTitle || product.title;
}

function getDisplayDescription(product: Product): string | undefined {
  return product.wittyDescription || product.sourceQuery;
}

function getSourceLabel(source: Product['source']): string {
  return source === 'amazon' ? 'Amazon' : 'Etsy';
}

function getItemListId(clickSource: string, contextSlug?: string): string {
  return contextSlug ? `${clickSource}:${contextSlug}` : clickSource;
}

export function ProductGrid({ products, clickSource, contextSlug, searchQueryId }: ProductGridProps) {
  const impressedProductIdsRef = useRef(new Set<string>());
  const productIdsKey = useMemo(
    () => products.map((product) => product.id).join('|'),
    [products]
  );
  const itemListId = getItemListId(clickSource, contextSlug);

  useEffect(() => {
    impressedProductIdsRef.current.clear();
  }, [itemListId]);

  useEffect(() => {
    if (products.length === 0) {
      return;
    }

    const newProducts = products.filter((product) => !impressedProductIdsRef.current.has(product.id));
    if (newProducts.length === 0) {
      return;
    }

    newProducts.forEach((product) => impressedProductIdsRef.current.add(product.id));
    getClickAttribution();

    fetch('/api/track-impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productIds: newProducts.map((product) => product.id),
        source: clickSource,
        contextSlug,
      }),
    }).catch(() => {});

    captureViewItemList({
      clickSource,
      contextSlug,
      products: newProducts.map((product) => ({
        id: product.id,
        source: product.source,
      })),
    });
  }, [clickSource, contextSlug, itemListId, products, productIdsKey]);

  const handleProductClick = (url: string, product: Product, index: number) => {
    const attribution = getClickAttribution();
    const clickPayload = JSON.stringify({
      productId: product.id,
      source: clickSource,
      contextSlug,
      searchQueryId: searchQueryId || undefined,
      attribution,
    });
    const sentWithBeacon = typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon('/api/track-click', new Blob([clickPayload], { type: 'application/json' }));

    if (!sentWithBeacon) fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: clickPayload,
      keepalive: true,
    }).catch(() => {});

    captureSelectItem({
      clickSource,
      contextSlug,
      productId: product.id,
      productSource: product.source,
      index,
    });
    captureOutboundProductClick({
      clickSource,
      contextSlug,
      productId: product.id,
      productSource: product.source,
      affiliateUrl: url,
      attribution,
    });
  };

  const handleGiftPageClick = (product: Product, index: number) => {
    getClickAttribution();
    captureSelectItem({
      clickSource,
      contextSlug,
      productId: product.id,
      productSource: product.source,
      index,
    });
  };

  if (products.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-7">
      {products.map((product, index) => {
        const title = getDisplayTitle(product);
        const description = getDisplayDescription(product);
        const hasPrice = hasFreshProductPrice(product);
        const giftPath = product.slug ? `/gifts/${encodeURIComponent(product.slug)}` : undefined;

        return (
          <a
            key={product.id}
            href={giftPath || product.affiliateUrl}
            target={giftPath ? undefined : '_blank'}
            rel={giftPath ? undefined : 'noopener noreferrer'}
            onClick={() => giftPath
              ? handleGiftPageClick(product, index)
              : handleProductClick(product.affiliateUrl, product, index)}
            className="group flex flex-col"
          >
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-950/[0.07] transition duration-300 group-hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)] group-hover:ring-zinc-950/10">
              {product.imageUrl ? (
                <div className="absolute inset-5 sm:inset-6">
                  <ProductImage
                    imageUrl={product.imageUrl}
                    alt={product.title}
                    className="object-contain transition duration-300 ease-out group-hover:scale-[1.05]"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    priority={index === 0}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-400">
                  Image unavailable
                </div>
              )}
              {hasPrice && (
                <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-950/5 backdrop-blur">
                  {formatPrice(product)}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1 px-0.5 pt-3">
              <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-zinc-900 underline-offset-4 group-hover:underline">
                {title}
              </h3>

              {description && (
                <p className="line-clamp-2 text-sm leading-snug text-zinc-500">
                  {description}
                </p>
              )}

              <p className="pt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                {giftPath ? 'View gift' : getSourceLabel(product.source)}
                <span aria-hidden="true" className="ml-1 inline-block transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px">
                  {giftPath ? '→' : '↗'}
                </span>
              </p>
            </div>
          </a>
        );
      })}
    </div>
  );
}
