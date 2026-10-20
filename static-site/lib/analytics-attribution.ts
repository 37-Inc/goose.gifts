import { buildPageViewEvent } from "../../lib/analytics-contract";
import type { ClickAttribution } from "../../lib/analytics-contract";

const STORAGE_KEY = "stupid.gifts.analytics-attribution.v1";
const FIELDS = ["traffic_source", "traffic_medium", "traffic_campaign"] as const;
type Traffic = { traffic_source: string; traffic_medium?: string; traffic_campaign?: string };

function sanitize(attribution: Partial<ClickAttribution>): Traffic {
  const properties = buildPageViewEvent({ pathname: "/", attribution }).properties;
  return {
    traffic_source: properties.traffic_source || "direct",
    ...(properties.traffic_medium ? { traffic_medium: properties.traffic_medium } : {}),
    ...(properties.traffic_campaign ? { traffic_campaign: properties.traffic_campaign } : {}),
  };
}
function attribution(traffic: Traffic): Partial<ClickAttribution> {
  return { utmSource: traffic.traffic_source, utmMedium: traffic.traffic_medium,
    utmCampaign: traffic.traffic_campaign };
}

/** Tab-lifetime coarse context only; never a consent flag or a session identity. */
export function createSessionAttribution(isAllowed: () => boolean) {
  let memory: Traffic | undefined;
  function read(): Traffic | undefined {
    try {
      if (!isAllowed()) return;
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw || raw.length > 1024) return;
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)
        || typeof value.traffic_source !== "string" || !value.traffic_source
        || Object.keys(value).some((key) => !FIELDS.includes(key as typeof FIELDS[number]))
        || Object.values(value).some((item) => typeof item !== "string" || !item)) return;
      const safe = sanitize(attribution(value));
      if (FIELDS.some((key) => value[key] !== safe[key])) return;
      return safe;
    } catch { /* Disabled, blocked or invalid storage is not a browsing failure. */ }
  }
  return (): Partial<ClickAttribution> => {
    if (!isAllowed()) return {};
    const params = new URLSearchParams(window.location.search);
    const coarse = { utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined };
    const explicit = Object.values(coarse).some((value) => value?.trim());
    let referrerHost: string | undefined;
    try {
      const host = new URL(document.referrer).hostname;
      if (host !== window.location.hostname && host !== "www.stupid.gifts") referrerHost = host;
    } catch {}
    // A new explicit campaign replaces context; an ordinary internal visit does not.
    const traffic = explicit ? sanitize({ ...coarse, referrerHost })
      : memory || read() || sanitize({ referrerHost });
    if (JSON.stringify(memory) !== JSON.stringify(traffic)) {
      memory = traffic;
      try {
        if (isAllowed()) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(traffic));
      } catch { /* Retain in-page context even when tab storage is unavailable. */ }
    }
    return attribution(traffic);
  };
}
