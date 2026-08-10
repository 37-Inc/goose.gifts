export type ProductAnalyticsSource = 'amazon' | 'etsy';

export interface ClickAttribution {
  sessionId: string;
  landingPage: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrerHost?: string;
}

type AnalyticsItem = {
  item_id: string;
  item_brand: ProductAnalyticsSource;
  index: number;
};

export type AnalyticsProperties = {
  pathname: string;
  ui_context?: string;
  result_count?: number;
  product_id?: string;
  source?: ProductAnalyticsSource;
  link_domain?: string;
  traffic_source?: string;
  traffic_medium?: string;
  traffic_campaign?: string;
  item_list_id?: string;
  items?: AnalyticsItem[];
};

export type ExplicitAnalyticsEvent = {
  name:
    | 'page_view'
    | 'search'
    | 'view_item_list'
    | 'select_item'
    | 'conversion_event_outbound_click'
    | 'random_gift_spin';
  properties: AnalyticsProperties;
};

const MAX_PATHNAME_LENGTH = 300;
const MAX_DIMENSION_LENGTH = 100;

function sanitizeDimension(value: string | undefined, fallback?: string): string | undefined {
  const normalized = value
    ?.trim()
    .slice(0, MAX_DIMENSION_LENGTH)
    .replace(/[^a-zA-Z0-9._:/-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}

export function sanitizePathname(value: string | undefined): string {
  if (!value) {
    return '/';
  }

  try {
    const pathname = new URL(value, 'https://www.goose.gifts').pathname;
    return pathname.startsWith('/')
      ? pathname.slice(0, MAX_PATHNAME_LENGTH)
      : '/';
  } catch {
    return '/';
  }
}

export function getLinkDomain(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).hostname.toLowerCase().slice(0, MAX_DIMENSION_LENGTH) || undefined;
  } catch {
    return undefined;
  }
}

function getTrafficProperties(attribution?: Partial<ClickAttribution>) {
  const referrerHost = getLinkDomain(
    attribution?.referrerHost
      ? `https://${attribution.referrerHost}`
      : undefined
  );

  return {
    traffic_source: sanitizeDimension(attribution?.utmSource)
      || referrerHost
      || 'direct',
    traffic_medium: sanitizeDimension(attribution?.utmMedium),
    traffic_campaign: sanitizeDimension(attribution?.utmCampaign),
  };
}

function sanitizeProductId(value: string): string {
  return sanitizeDimension(value, 'unknown') || 'unknown';
}

function sanitizeUiContext(value: string, contextSlug?: string): string {
  const context = contextSlug ? `${value}:${contextSlug}` : value;
  return sanitizeDimension(context, 'unknown') || 'unknown';
}

function sanitizeResultCount(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(Number.isFinite(value) ? value : 0)));
}

export function buildPageViewEvent(input: {
  pathname: string;
  attribution?: Partial<ClickAttribution>;
}): ExplicitAnalyticsEvent {
  return {
    name: 'page_view',
    properties: {
      pathname: sanitizePathname(input.pathname),
      ...getTrafficProperties(input.attribution),
    },
  };
}

export function buildSearchEvent(input: {
  pathname: string;
  resultCount: number;
  attribution?: Partial<ClickAttribution>;
}): ExplicitAnalyticsEvent {
  return {
    name: 'search',
    properties: {
      pathname: sanitizePathname(input.pathname),
      ui_context: 'catalog_search',
      result_count: sanitizeResultCount(input.resultCount),
      ...getTrafficProperties(input.attribution),
    },
  };
}

export function buildViewItemListEvent(input: {
  pathname: string;
  clickSource: string;
  contextSlug?: string;
  products: Array<{ id: string; source: ProductAnalyticsSource }>;
}): ExplicitAnalyticsEvent {
  const uiContext = sanitizeUiContext(input.clickSource, input.contextSlug);

  return {
    name: 'view_item_list',
    properties: {
      pathname: sanitizePathname(input.pathname),
      ui_context: uiContext,
      item_list_id: uiContext,
      result_count: sanitizeResultCount(input.products.length),
      items: input.products.slice(0, 36).map((product, index) => ({
        item_id: sanitizeProductId(product.id),
        item_brand: product.source,
        index,
      })),
    },
  };
}

export function buildSelectItemEvent(input: {
  pathname: string;
  clickSource: string;
  contextSlug?: string;
  productId: string;
  productSource: ProductAnalyticsSource;
  index: number;
}): ExplicitAnalyticsEvent {
  const uiContext = sanitizeUiContext(input.clickSource, input.contextSlug);

  return {
    name: 'select_item',
    properties: {
      pathname: sanitizePathname(input.pathname),
      ui_context: uiContext,
      item_list_id: uiContext,
      product_id: sanitizeProductId(input.productId),
      source: input.productSource,
      items: [{
        item_id: sanitizeProductId(input.productId),
        item_brand: input.productSource,
        index: Math.max(0, Math.round(input.index)),
      }],
    },
  };
}

export function buildOutboundClickEvent(input: {
  pathname: string;
  clickSource: string;
  contextSlug?: string;
  productId: string;
  productSource: ProductAnalyticsSource;
  affiliateUrl: string;
  attribution?: Partial<ClickAttribution>;
}): ExplicitAnalyticsEvent {
  return {
    name: 'conversion_event_outbound_click',
    properties: {
      pathname: sanitizePathname(input.pathname),
      ui_context: sanitizeUiContext(input.clickSource, input.contextSlug),
      product_id: sanitizeProductId(input.productId),
      source: input.productSource,
      link_domain: getLinkDomain(input.affiliateUrl),
      ...getTrafficProperties(input.attribution),
    },
  };
}

export function buildRandomGiftSpinEvent(pathname: string): ExplicitAnalyticsEvent {
  return {
    name: 'random_gift_spin',
    properties: {
      pathname: sanitizePathname(pathname),
      ui_context: 'random_gift',
    },
  };
}
