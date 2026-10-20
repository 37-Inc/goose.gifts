/** Build-time source identity, never inferred from NODE_ENV or a request host.
 * next.config inlines NEXT_PUBLIC_STATIC_SITE_MODE for browser code; offline
 * release builders use the same reviewed CATALOG_SITE_MODE value.
 */
export const SITE_SOURCE_MODES = ["preview", "goose-production", "stupid-production"] as const;
export type SiteSourceMode = typeof SITE_SOURCE_MODES[number];
export interface SiteIdentity {
  brand: "goose" | "stupid"; name: string; origin: string; hostname: string; wordmark: string; tagline: string;
}
const PRESETS = Object.freeze({
  goose: Object.freeze({ brand: "goose", name: "Goose Gifts", origin: "https://www.goose.gifts", hostname: "www.goose.gifts",
    wordmark: "goose.gifts", tagline: "Absurd, useful, and deeply unnecessary." } satisfies SiteIdentity),
  stupid: Object.freeze({ brand: "stupid", name: "Stupid Gifts", origin: "https://stupid.gifts", hostname: "stupid.gifts",
    wordmark: "stupid.gifts", tagline: "Very bad ideas. Carefully considered." } satisfies SiteIdentity),
});
export function resolveSiteSourceMode(value: string | undefined): SiteSourceMode {
  if (value === undefined) return "preview";
  if (!(SITE_SOURCE_MODES as readonly string[]).includes(value)) throw new Error("Invalid static site source mode");
  return value as SiteSourceMode;
}
export function siteIdentityFor(mode: SiteSourceMode): Readonly<SiteIdentity> {
  resolveSiteSourceMode(mode);
  if (mode === "goose-production") return PRESETS.goose;
  if (mode === "stupid-production") return PRESETS.stupid;
  return Object.freeze({ ...PRESETS.stupid, origin: "https://staging.stupid.gifts", hostname: "staging.stupid.gifts" });
}
const configured = process.env.CATALOG_SITE_MODE;
const inlined = process.env.NEXT_PUBLIC_STATIC_SITE_MODE;
if (configured !== undefined && inlined !== undefined && configured !== inlined) throw new Error("Static site source mode mismatch");
export const siteSourceMode = resolveSiteSourceMode(inlined ?? configured);
export const siteIdentity = siteIdentityFor(siteSourceMode);
export const isSitePreview = siteSourceMode === "preview";
export const isSiteProduction = !isSitePreview;
/** Small deterministic artifact for the release builder to checksum and compare
 * against independently reviewed source mode. This is not deployment authority.
 */
export const siteIdentityRecord = Object.freeze({ schemaVersion: 1 as const, sourceMode: siteSourceMode, ...siteIdentity });

export function isSiteAnalyticsHostname(hostname: string): boolean {
  return isSiteProduction && (hostname === siteIdentity.hostname || siteIdentity.brand === "goose" && hostname === "goose.gifts");
}
export function isSiteInternalHostname(hostname: string): boolean {
  return hostname === siteIdentity.hostname || hostname === `${siteIdentity.brand}.gifts` || hostname === `www.${siteIdentity.brand}.gifts`;
}
