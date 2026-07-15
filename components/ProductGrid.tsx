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

const LABEL_RULES = [
  { label: 'dad joke', terms: ['dad', 'father', 'grandpa', 'pun', 'joke'] },
  { label: 'office safe', terms: ['coworker', 'office', 'desk', 'boss', 'meeting', 'work'] },
  { label: 'white elephant', terms: ['white elephant', 'party', 'exchange'] },
  { label: 'pet chaos', terms: ['pet', 'dog', 'cat', 'pug'] },
  { label: 'kitchen oddity', terms: ['kitchen', 'mug', 'coffee', 'ramen', 'cook', 'cookbook'] },
  { label: 'prank', terms: ['prank', 'fake', 'gag'] },
  { label: 'weird find', terms: ['weird', 'bizarre', 'oddball', 'ridiculous', 'strange'] },
  { label: 'snarky', terms: ['sarcastic', 'snark', 'retirement'] },
  { label: 'birthday', terms: ['birthday'] },
  { label: 'holiday', terms: ['stocking', 'christmas', 'holiday', 'secret santa'] },
  { label: 'self care', terms: ['spa', 'bath', 'candle', 'skincare', 'massage'] },
  { label: 'bookish', terms: ['book', 'coloring', 'journal'] },
];

function formatTag(tag: string): string {
  return tag.replace(/-/g, ' ').trim().toLowerCase();
}

function isDisplayableTag(tag: string): boolean {
  return tag.length > 0
    && tag.length <= 18
    && !tag.includes(' gift')
    && !tag.includes(' for ');
}

function addLabel(labels: string[], label: string) {
  if (!labels.includes(label)) {
    labels.push(label);
  }
}

function getHumorLabels(product: Product): string[] {
  const labels: string[] = [];

  product.humorTags?.forEach((tag) => {
    const formatted = formatTag(tag);
    if (isDisplayableTag(formatted)) addLabel(labels, formatted);
  });

  const haystack = [
    product.title,
    product.punnyTitle,
    product.wittyDescription,
    product.sourceQuery,
  ].filter(Boolean).join(' ').toLowerCase();

  for (const rule of LABEL_RULES) {
    if (labels.length >= 2) break;
    if (rule.terms.some((term) => haystack.includes(term))) {
      addLabel(labels, rule.label);
    }
  }

  if (labels.length === 0) {
    labels.push('novelty');
  }

  return labels.slice(0, 2);
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {products.map((product, index) => {
        const title = getDisplayTitle(product);
        const description = getDisplayDescription(product);
        const tags = getHumorLabels(product);

        return (
          <a
            key={product.id}
            href={product.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => handleProductClick(product.affiliateUrl, product, index)}
            className="group flex min-h-[19rem] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-lg"
          >
            <div className="relative aspect-square overflow-hidden bg-white">
              {product.imageUrl ? (
                <div className="absolute inset-2">
                  <ProductImage
                    imageUrl={product.imageUrl}
                    alt={product.title}
                    className="object-contain transition duration-300 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                    priority={index === 0}
                  />
                </div>
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

              <div className="mt-auto flex flex-wrap gap-1 pt-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
