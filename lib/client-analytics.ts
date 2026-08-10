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

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Navigator {
    globalPrivacyControl?: boolean;
  }

  interface Window {
    dataLayer?: unknown[][];
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

function initializeGoogle() {
  if (googleInitialized || !isClientAnalyticsAllowed()) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => {
    window.dataLayer?.push(args);
  });
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

function initializePostHog(): Promise<typeof import('posthog-js').default | undefined> {
  if (
    !isClientAnalyticsAllowed()
    || !POSTHOG_KEY
    || !POSTHOG_HOST?.startsWith('https://')
  ) {
    return Promise.resolve(undefined);
  }

  if (posthogClient) {
    return Promise.resolve(posthogClient);
  }

  posthogInitialization ||= import('posthog-js').then(({ default: posthog }) => {
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
    });
    posthogClient = posthog;
    return posthog;
  });

  return posthogInitialization;
}

function getSanitizedPageLocation(pathname: string): string {
  return `https://www.goose.gifts${sanitizePathname(pathname)}`;
}

function dispatchEvent(
  event: ExplicitAnalyticsEvent,
  googleOptions: { callback?: () => void } = {}
): boolean {
  if (!isClientAnalyticsAllowed()) {
    return false;
  }

  initializeGoogle();
  void initializePostHog().then((client) => {
    client?.capture(event.name, event.properties);
  });

  const properties = {
    ...event.properties,
    page_location: getSanitizedPageLocation(event.properties.pathname),
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

export function capturePageView(pathname: string) {
  if (!isClientAnalyticsAllowed()) {
    return;
  }

  dispatchEvent(buildPageViewEvent({
    pathname,
    attribution: getClickAttribution(),
  }));
}

export function captureSearch(resultCount: number) {
  if (!isClientAnalyticsAllowed()) {
    return;
  }

  dispatchEvent(buildSearchEvent({
    pathname: window.location.pathname,
    resultCount,
    attribution: getClickAttribution(),
  }));
}

export function captureViewItemList(input: {
  clickSource: string;
  contextSlug?: string;
  products: Array<{ id: string; source: ProductAnalyticsSource }>;
}) {
  dispatchEvent(buildViewItemListEvent({
    pathname: window.location.pathname,
    ...input,
  }));
}

export function captureSelectItem(input: {
  clickSource: string;
  contextSlug?: string;
  productId: string;
  productSource: ProductAnalyticsSource;
  index: number;
}) {
  dispatchEvent(buildSelectItemEvent({
    pathname: window.location.pathname,
    ...input,
  }));
}

export function captureOutboundProductClick(input: {
  clickSource: string;
  contextSlug?: string;
  productId: string;
  productSource: ProductAnalyticsSource;
  affiliateUrl: string;
  attribution: ClickAttribution;
  callback?: () => void;
}): boolean {
  const event = buildOutboundClickEvent({
    pathname: window.location.pathname,
    ...input,
  });

  return dispatchEvent(event, { callback: input.callback });
}

export function captureRandomGiftSpin() {
  dispatchEvent(buildRandomGiftSpinEvent(window.location.pathname));
}
