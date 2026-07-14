'use client';

import { useEffect } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import type { Product } from '@/lib/types';

interface ProductClickButtonProps {
  product: Product;
  clickSource: string;
  contextSlug?: string;
  children: ReactNode;
  className: string;
}

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

type Gtag = (command: 'event', eventName: string, params: Record<string, unknown>) => void;

const ATTRIBUTION_STORAGE_KEY = 'goose.gifts.attribution.v1';
const SESSION_STORAGE_KEY = 'goose.gifts.session_id.v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

function getGtag(): Gtag | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return (window as Window & { gtag?: Gtag }).gtag;
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
    // Attribution should never block outbound clicks.
  }

  return attribution;
}

function getDisplayTitle(product: Product): string {
  return product.punnyTitle || product.title;
}

function openOutbound(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function getLinkDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function ProductClickButton({
  product,
  clickSource,
  contextSlug,
  children,
  className,
}: ProductClickButtonProps) {
  useEffect(() => {
    fetch('/api/track-impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productIds: [product.id],
        source: clickSource,
        contextSlug,
      }),
    }).catch(() => {});
  }, [clickSource, contextSlug, product.id]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const attribution = getClickAttribution();

    fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        source: clickSource,
        contextSlug,
        attribution,
      }),
    }).catch(() => {});

    const gtag = getGtag();
    if (gtag) {
      gtag('event', 'select_item', {
        item_list_id: contextSlug ? `${clickSource}:${contextSlug}` : clickSource,
        item_list_name: contextSlug || clickSource,
        items: [{
          item_id: product.id,
          item_name: getDisplayTitle(product),
          item_brand: product.source === 'amazon' ? 'Amazon' : 'Etsy',
          item_category: product.sourceQuery || 'catalog',
          price: product.price > 0 ? product.price : undefined,
          currency: product.currency || 'USD',
          index: 0,
        }],
      });

      gtag('event', 'conversion_event_outbound_click', {
        event_category: 'catalog_product',
        event_label: product.affiliateUrl,
        product_id: product.id,
        click_source: clickSource,
        context_slug: contextSlug,
        link_domain: getLinkDomain(product.affiliateUrl),
        landing_page: attribution.landingPage,
        traffic_source: attribution.utmSource || attribution.referrerHost || 'direct',
        traffic_medium: attribution.utmMedium,
        traffic_campaign: attribution.utmCampaign,
        event_callback: () => openOutbound(product.affiliateUrl),
        event_timeout: 2000,
      });
      return;
    }

    openOutbound(product.affiliateUrl);
  };

  return (
    <a
      href={product.affiliateUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
