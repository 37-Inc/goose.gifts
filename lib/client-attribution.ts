'use client';

import type { ClickAttribution } from './analytics-contract';

const ATTRIBUTION_STORAGE_KEY = 'goose.gifts.attribution.v1';
const SESSION_STORAGE_KEY = 'goose.gifts.session_id.v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

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

export function getClickAttribution(): ClickAttribution {
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
    // First-party attribution is additive and must never block navigation.
  }

  return attribution;
}
