'use client';
import {
  buildOutboundClickEvent,
  buildPageViewEvent,
  buildRandomGiftSpinEvent,
  buildSearchEvent,
  buildSelectItemEvent,
  buildViewItemListEvent,
  sanitizePathname,
} from './analytics-contract';
import type {
  ClickAttribution,
  ExplicitAnalyticsEvent,
  ProductAnalyticsSource,
} from './analytics-contract';
import { getClickAttribution } from './client-attribution';

const GA4_MEASUREMENT_ID = 'G-6RR3HPR747';
const GOOGLE_ADS_ID = 'AW-17626116539';
const PRODUCTION_HOSTS = new Set(['goose.gifts', 'www.goose.gifts']);
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const POSTHOG_ALLOWED_PROPERTIES = new Set([
  'distinct_id',
  'item_list_id',
  'items',
  'link_domain',
  'pathname',
  'product_id',
  'result_count',
  'source',
  'token',
  'traffic_campaign',
  'traffic_medium',
  'traffic_source',
  'ui_context',
]);
const EXPLICIT_EVENT_NAMES = new Set<ExplicitAnalyticsEvent['name']>([
  'page_view',
  'search',
  'view_item_list',
  'select_item',
  'conversion_event_outbound_click',
  'random_gift_spin',
]);

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Navigator {
    globalPrivacyControl?: boolean;
  }

  interface Window {
    dataLayer?: unknown[];
    doNotTrack?: string | null;
    gtag?: Gtag;
  }
}

let googleInitialized = false;
let posthogClient: typeof import('posthog-js').default | undefined;
let posthogInitialization: Promise<typeof import('posthog-js').default | undefined> | undefined;

function isDoNotTrackEnabled(): boolean {
  return navigator.doNotTrack === '1'
    || window.doNotTrack === '1'
    || navigator.globalPrivacyControl === true;
}

export function isClientAnalyticsAllowed(): boolean {
  return typeof window !== 'undefined'
    && PRODUCTION_HOSTS.has(window.location.hostname)
    && !isDoNotTrackEnabled();
}

function initializeGoogle(isAllowed: () => boolean) {
  if (googleInitialized || !isAllowed()) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    // Google Tag explicitly requires the function's Arguments object here.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA4_MEASUREMENT_ID, { send_page_view: false });
  window.gtag('config', GOOGLE_ADS_ID, { send_page_view: false });

  if (!document.querySelector(`script[data-goose-analytics="${GA4_MEASUREMENT_ID}"]`)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    script.dataset.gooseAnalytics = GA4_MEASUREMENT_ID;
    document.head.appendChild(script);
  }

  googleInitialized = true;
}

function initializePostHog(isAllowed: () => boolean): Promise<typeof import('posthog-js').default | undefined> {
  if (
    !isAllowed()
    || !POSTHOG_KEY
    || !POSTHOG_HOST?.startsWith('https://')
  ) {
    return Promise.resolve(undefined);
  }

  if (posthogClient) {
    return Promise.resolve(posthogClient);
  }

  posthogInitialization ||= import('posthog-js').then(({ default: posthog }) => {
    if (!isAllowed()) {
      posthogInitialization = undefined;
      return undefined;
    }
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      defaults: '2026-05-30',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      enable_heatmaps: false,
      advanced_disable_feature_flags: true,
      person_profiles: 'never',
      persistence: 'memory',
      respect_dnt: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      property_denylist: [
        '$current_url',
        '$referrer',
        '$initial_current_url',
        '$initial_referrer',
        '$initial_referring_domain',
        '$referring_domain',
        '$utm_source',
        '$utm_medium',
        '$utm_campaign',
        '$utm_content',
        '$utm_term',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
      ],
      before_send: (event) => {
        if (!isAllowed()) return null;
        if (!event || !EXPLICIT_EVENT_NAMES.has(event.event as ExplicitAnalyticsEvent['name'])) {
          return null;
        }

        return {
          ...event,
          properties: {
            ...Object.fromEntries(
              Object.entries(event.properties || {})
                .filter(([key]) => POSTHOG_ALLOWED_PROPERTIES.has(key))
            ),
            $geoip_disable: true,
          },
          $set: undefined,
          $set_once: undefined,
        };
      },
    });
    posthogClient = posthog;
    return posthog;
  }).catch(() => {
    posthogInitialization = undefined;
    return undefined;
  });

  return posthogInitialization;
}

export interface ClientAnalyticsPolicy {
  /** Additional gate, never a replacement for DNT/GPC. */
  isAllowed: () => boolean;
  pageOrigin: string;
  getAttribution: () => Partial<ClickAttribution>;
}

function dispatchEvent(
  event: ExplicitAnalyticsEvent,
  policy: ClientAnalyticsPolicy,
  googleOptions: { callback?: () => void } = {}
): boolean {
  const isAllowed = () => typeof window !== 'undefined'
    && policy.isAllowed() && !isDoNotTrackEnabled();
  if (!isAllowed()) {
    return false;
  }

  initializeGoogle(isAllowed);
  void initializePostHog(isAllowed).then((client) => {
    if (isAllowed()) client?.capture(event.name, event.properties);
  });

  const properties = {
    ...event.properties,
    page_location: `${policy.pageOrigin}${sanitizePathname(event.properties.pathname)}`,
    page_referrer: '',
  };

  if (!window.gtag) {
    return false;
  }

  window.gtag('event', event.name, {
    ...properties,
    ...(googleOptions.callback
      ? { event_callback: googleOptions.callback, event_timeout: 2000 }
      : {}),
  });

  return true;
}

/** Reuse the same destinations and sanitizers with an explicit host/build policy. */
export function createClientAnalytics(policy: ClientAnalyticsPolicy) {
  const allowed = () => typeof window !== 'undefined'
    && policy.isAllowed() && !isDoNotTrackEnabled();

  function capturePageView(pathname: string) {
    if (!allowed()) return;
    dispatchEvent(buildPageViewEvent({
      pathname,
      attribution: policy.getAttribution(),
    }), policy);
  }

  function captureSearch(resultCount: number) {
    if (!allowed()) return;
    dispatchEvent(buildSearchEvent({
      pathname: window.location.pathname,
      resultCount,
      attribution: policy.getAttribution(),
    }), policy);
  }

  function captureViewItemList(input: {
    clickSource: string;
    contextSlug?: string;
    products: Array<{ id: string; source: ProductAnalyticsSource }>;
  }) {
    if (!allowed()) return;
    dispatchEvent(buildViewItemListEvent({
      pathname: window.location.pathname,
      ...input,
    }), policy);
  }

  function captureSelectItem(input: {
    clickSource: string;
    contextSlug?: string;
    productId: string;
    productSource: ProductAnalyticsSource;
    index: number;
  }) {
    if (!allowed()) return;
    dispatchEvent(buildSelectItemEvent({
      pathname: window.location.pathname,
      ...input,
    }), policy);
  }

  function captureOutboundProductClick(input: {
    clickSource: string;
    contextSlug?: string;
    productId: string;
    productSource: ProductAnalyticsSource;
    affiliateUrl: string;
    attribution?: Partial<ClickAttribution>;
    callback?: () => void;
  }): boolean {
    if (!allowed()) return false;
    const event = buildOutboundClickEvent({
      pathname: window.location.pathname,
      ...input,
      attribution: input.attribution || policy.getAttribution(),
    });

    return dispatchEvent(event, policy, { callback: input.callback });
  }

  function captureRandomGiftSpin() {
    if (!allowed()) return;
    dispatchEvent(buildRandomGiftSpinEvent(window.location.pathname), policy);
  }
  return {
    capturePageView,
    captureSearch,
    captureViewItemList,
    captureSelectItem,
    captureOutboundProductClick,
    captureRandomGiftSpin,
  };
}

// Existing Goose callers retain their original host policy, attribution and origin.
export const {
  capturePageView, captureSearch, captureViewItemList, captureSelectItem,
  captureOutboundProductClick, captureRandomGiftSpin,
} = createClientAnalytics({
  isAllowed: isClientAnalyticsAllowed,
  pageOrigin: 'https://www.goose.gifts',
  getAttribution: getClickAttribution,
});
