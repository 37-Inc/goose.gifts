'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Product } from '@/lib/types';
import { ProductImage } from './ProductImage';

interface ProductGridProps {
  products: Product[];
  clickSource: string;
  contextSlug?: string;
  searchQueryId?: string | null;
}

type Gtag = (command: 'event', eventName: string, params: Record<string, unknown>) => void;

interface ClickAttribution {
  sessionId: string;
  landingPage: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrerHost?: string;
}

const ATTRIBUTION_STORAGE_KEY = 'goose.gifts.attribution.v1';
const SESSION_STORAGE_KEY = 'goose.gifts.session_id.v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

function getGtag(): Gtag | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return (window as Window & { gtag?: Gtag }).gtag;
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

function getDisplayTitle(product: Product): string {
  return product.punnyTitle || product.title;
}

function getDisplayDescription(product: Product): string | undefined {
  return product.wittyDescription || product.sourceQuery;
}

function getSourceLabel(source: Product['source']): string {
  return source === 'amazon' ? 'Amazon' : 'Etsy';
}

function getLinkDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getOrCreateSessionId(): string {
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const sessionId = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

function getHost(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

function readStoredAttribution(): Partial<ClickAttribution> {
  try {
    const stored = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    return stored ? JSON.parse(stored) as Partial<ClickAttribution> : {};
  } catch {
    return {};
  }
}

function getClickAttribution(): ClickAttribution {
  const url = new URL(window.location.href);
  const stored = readStoredAttribution();
  const params = url.searchParams;
  const hasUtm = UTM_KEYS.some((key) => params.has(key));
  const currentReferrerHost = document.referrer
    ? getHost(document.referrer)
    : undefined;

  const attribution: ClickAttribution = {
    sessionId: getOrCreateSessionId(),
    landingPage: stored.landingPage || `${url.pathname}${url.search}`,
    referrerHost: stored.referrerHost || currentReferrerHost,
    utmSource: stored.utmSource,
    utmMedium: stored.utmMedium,
    utmCampaign: stored.utmCampaign,
    utmContent: stored.utmContent,
    utmTerm: stored.utmTerm,
  };

  if (hasUtm) {
    attribution.landingPage = `${url.pathname}${url.search}`;
    attribution.utmSource = params.get('utm_source') || undefined;
    attribution.utmMedium = params.get('utm_medium') || undefined;
    attribution.utmCampaign = params.get('utm_campaign') || undefined;
    attribution.utmContent = params.get('utm_content') || undefined;
    attribution.utmTerm = params.get('utm_term') || undefined;
    attribution.referrerHost = currentReferrerHost;
  }

  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Ignore storage failures; attribution is additive and should never block clicks.
  }

  return attribution;
}

function getItemListId(clickSource: string, contextSlug?: string): string {
  return contextSlug ? `${clickSource}:${contextSlug}` : clickSource;
}

function getGaItems(products: Product[]) {
  return products.slice(0, 36).map((product, index) => ({
    item_id: product.id,
    item_name: getDisplayTitle(product),
    item_brand: getSourceLabel(product.source),
    item_category: product.sourceQuery || 'catalog',
    price: product.price > 0 ? product.price : undefined,
    currency: product.currency || 'USD',
    index,
  }));
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

    const gtag = getGtag();
    if (gtag) {
      gtag('event', 'view_item_list', {
        item_list_id: itemListId,
        item_list_name: contextSlug || clickSource,
        items: getGaItems(newProducts),
      });
    }
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

    const gtag = getGtag();
    if (gtag) {
      gtag('event', 'select_item', {
        item_list_id: itemListId,
        item_list_name: contextSlug || clickSource,
        items: [{
          item_id: product.id,
          item_name: getDisplayTitle(product),
          item_brand: getSourceLabel(product.source),
          item_category: product.sourceQuery || 'catalog',
          price: product.price > 0 ? product.price : undefined,
          currency: product.currency || 'USD',
          index,
        }],
      });

      gtag('event', 'conversion_event_outbound_click', {
        event_category: 'catalog_product',
        event_label: url,
        product_id: product.id,
        click_source: clickSource,
        context_slug: contextSlug,
        link_domain: getLinkDomain(url),
        landing_page: attribution.landingPage,
        traffic_source: attribution.utmSource || attribution.referrerHost || 'direct',
        traffic_medium: attribution.utmMedium,
        traffic_campaign: attribution.utmCampaign,
      });
    }
  };

  if (products.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-7">
      {products.map((product, index) => {
        const title = getDisplayTitle(product);
        const description = getDisplayDescription(product);
        const hasPrice = product.price > 0;

        return (
          <a
            key={product.id}
            href={product.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => handleProductClick(product.affiliateUrl, product, index)}
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
                {getSourceLabel(product.source)}
                <span aria-hidden="true" className="ml-1 inline-block transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px">↗</span>
              </p>
            </div>
          </a>
        );
      })}
    </div>
  );
}
