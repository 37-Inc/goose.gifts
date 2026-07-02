'use client';

import { useEffect, useState } from 'react';
import type { Product } from '@/lib/types';
import { ProductImage } from './ProductImage';

interface TrendingProductsProps {
  products: Product[];
}

type Gtag = (command: 'event', eventName: string, params: Record<string, unknown>) => void;

function getGtag(): Gtag | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return (window as Window & { gtag?: Gtag }).gtag;
}

function formatPrice(product: Product): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency || 'USD',
  }).format(product.price);
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

export function TrendingProducts({ products }: TrendingProductsProps) {
  const [impressionsTracked, setImpressionsTracked] = useState(false);

  useEffect(() => {
    if (impressionsTracked || products.length === 0) {
      return;
    }

    setImpressionsTracked(true);

    fetch('/api/track-impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productIds: products.map((product) => product.id),
      }),
    }).catch(() => {});
  }, [products, impressionsTracked]);

  if (products.length === 0) {
    return null;
  }

  const handleProductClick = (url: string, productId: string, e: React.MouseEvent) => {
    e.preventDefault();

    fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, source: 'catalog_home' }),
    }).catch(() => {});

    const gtag = getGtag();
    if (gtag) {
      gtag('event', 'conversion_event_outbound_click', {
        event_category: 'catalog_product',
        event_label: url,
        link_domain: new URL(url).hostname,
        event_callback: () => window.open(url, '_blank', 'noopener,noreferrer'),
        event_timeout: 2000,
      });
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="border-y border-zinc-200 bg-white py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-3 sm:px-4">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
              Fresh Finds
            </p>
            <h2 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">
              Ridiculous Gifts Worth Buying
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-zinc-600">
            Ranked by click data, freshness, and gag-gift appeal.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {products.map((product) => {
            const title = getDisplayTitle(product);
            const description = getDisplayDescription(product);
            const tags = product.humorTags?.slice(0, 2) ?? [];

            return (
              <a
                key={product.id}
                href={product.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleProductClick(product.affiliateUrl, product.id, e)}
                className="group flex min-h-[21rem] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-lg"
              >
                <div className="relative aspect-square overflow-hidden bg-zinc-100">
                  {product.imageUrl ? (
                    <ProductImage
                      imageUrl={product.imageUrl}
                      alt={product.title}
                      className="object-cover transition duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-500">
                      Image unavailable
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-zinc-950">{formatPrice(product)}</span>
                    <span className="shrink-0 text-zinc-500">{getSourceLabel(product.source)}</span>
                  </div>

                  <h3 className="line-clamp-3 text-sm font-semibold leading-snug text-zinc-950 group-hover:text-red-700">
                    {title}
                  </h3>

                  {description && (
                    <p className="line-clamp-2 text-xs leading-5 text-zinc-600">
                      {description}
                    </p>
                  )}

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs">
                    {product.rating ? (
                      <span className="font-medium text-zinc-700">
                        {product.rating.toFixed(1)} stars
                        {product.reviewCount ? ` (${product.reviewCount.toLocaleString()})` : ''}
                      </span>
                    ) : (
                      <span className="text-zinc-400">New find</span>
                    )}
                    <span className="font-semibold text-red-700">View</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
