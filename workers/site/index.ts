import type { CatalogAssetRoute, CatalogSnapshot, SiteAssetManifest } from '../../lib/catalog/types.ts';
import type { SearchAdapters, SemanticBudgetScope, SiteEnv } from './bindings.ts';
import { prepareStaticFeed } from './feed.ts';
import { createSearchHandler, json, sha256 } from './search.ts';

export type { SiteEnv, SearchAdapters, SearchStorage, SemanticBudgetScope } from './bindings.ts';
export interface SiteReleaseIdentity {
  release_id: string;
  code_sha: string;
  catalog_revision: string;
  catalog_snapshot_sha256: string;
  /** Build-derived hash of exact asset-manifest.json bytes; not a Vectorize visibility proof. */
  manifest_sha256: string;
}

const MAX_FEED_BODY = 64_000;
const TIMED_ROUTE = /^(?:\/$|\/gifts(?:\/|$)|\/gift-guides(?:\/|$)|\/howie(?:\/|$)|\/random-gift(?:[/.]|$)|\/weird-gift-index(?:[/.]|$)|\/catalog(?:[/.]|$)|\/data(?:\/|$)|\/sitemap(?:[/.]|$))/;
const RETIRED_ROUTE = /^\/(?:admin|auth|login|report|reports|bundles)(?:\/|$)|^\/api\/(?:admin|auth|og|generate-bundle)(?:\/|$)/;
const PUBLIC_ASSET = /^(?:\/_next\/static\/|\/fonts\/|\/brand\/|\/illustrations\/)|^\/(?:favicon\.ico|robots\.txt|[a-zA-Z0-9_-]+\.(?:png|webp|svg|jpg|jpeg|woff2?|ttf)|google[a-z0-9]+\.html|BingSiteAuth\.xml)$/;

function expiry(route: CatalogAssetRoute): number {
  return route.eligibleUntil === null ? Infinity : Date.parse(route.eligibleUntil);
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!);
}
function verifiedReleaseIdentity(input: unknown, manifest: SiteAssetManifest, snapshotDigest: string | undefined): SiteReleaseIdentity | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const value = input as Partial<SiteReleaseIdentity>;
  if (Object.keys(value).sort().join(',') !== 'catalog_revision,catalog_snapshot_sha256,code_sha,manifest_sha256,release_id'
    || typeof value.release_id !== 'string' || value.release_id !== manifest.releaseId
    || typeof value.catalog_revision !== 'string' || value.catalog_revision !== manifest.catalogRevision
    || typeof value.code_sha !== 'string' || !/^[a-f0-9]{40}$/.test(value.code_sha) || value.code_sha !== manifest.codeSha
    || typeof value.catalog_snapshot_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.catalog_snapshot_sha256) || value.catalog_snapshot_sha256 !== snapshotDigest
    || typeof value.manifest_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.manifest_sha256)) return;
  return Object.freeze({ release_id: value.release_id, code_sha: value.code_sha, catalog_revision: value.catalog_revision,
    catalog_snapshot_sha256: value.catalog_snapshot_sha256, manifest_sha256: value.manifest_sha256 });
}

function campaignSearch(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid']) {
    const value = params.get(key);
    if (value && /^[a-zA-Z0-9._~:-]{1,200}$/.test(value)) kept.set(key, value);
  }
  return kept.size ? `?${kept}` : '';
}
function pageAliasSearch(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = params.get(key);
    if (value && /^[a-zA-Z0-9._~:-]{1,200}$/.test(value)) kept.set(key, value);
  }
  const q = params.get('q');
  if (q !== null && q.length <= 200 && !/[\u0000-\u001f\u007f]/.test(q)) kept.set('q', q);
  const page = params.get('page');
  if (page !== null && page.length <= 128 && /^\d+$/.test(page)) kept.set('page', page);
  return kept.size ? `?${kept}` : '';
}
function boundedDirectoryPage(value: string, lastPage: number): number | null {
  if (value.length > 128 || !/^\d+$/.test(value)) return null;
  const normalized = value.replace(/^0+/, '');
  if (!normalized) return null;
  const maximum = String(lastPage);
  if (normalized.length > maximum.length || normalized.length === maximum.length && normalized > maximum) return lastPage;
  return Number(normalized); // At most the generated directory's digit count.
}

async function boundedJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > MAX_FEED_BODY) throw new Error('too_large');
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FEED_BODY) { await reader.cancel(); throw new Error('too_large'); }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return {}; }
}

/** Manifest and snapshot are compiled into the same immutable asset release. */
export function createSiteWorker<Env extends SiteEnv>(options: {
  manifest: SiteAssetManifest;
  snapshot: CatalogSnapshot;
  searchAdapters?: SearchAdapters<Env>;
  semanticBudgetScope?: SemanticBudgetScope;
  feedPlan?: unknown;
  /** Supplied only after build/verification binds exact manifest bytes; never hash the full manifest here. */
  releaseIdentity?: unknown;
  canonicalOrigin?: string;
  now?: () => number;
}) {
  const now = options.now || Date.now;
  const { manifest, snapshot } = options;
  if (manifest.catalogRevision !== snapshot.catalogRevision) throw new Error('release_revision_mismatch');
  const routes = new Map(Object.entries(manifest.routes));
  const lastDirectoryPage = Math.max(1, ...[...routes.keys()].flatMap((path) => {
    const match = path.match(/^\/gifts\/page\/([1-9]\d{0,8})$/);
    return match ? [Number(match[1])] : [];
  }));
  const directAssets = new Map<string, CatalogAssetRoute>();
  const safeAssets = new Set<string>();
  for (const route of routes.values()) {
    directAssets.set(route.assetPath, route);
    safeAssets.add(route.safeAssetPath);
  }
  const redirects = new Map(snapshot.slugHistory.map((entry) => [`/gifts/${entry.slug}`, `/gifts/${entry.canonicalSlug}`]));
  const heldProductPaths = new Set(snapshot.heldProducts.map((product) => product.path));
  const snapshotDigest = 'catalogSnapshotSha256' in manifest && typeof manifest.catalogSnapshotSha256 === 'string' ? manifest.catalogSnapshotSha256 : undefined;
  const releaseIdentity = verifiedReleaseIdentity(options.releaseIdentity, manifest, snapshotDigest);
  const preparedFeed = prepareStaticFeed(snapshot, options.feedPlan, snapshotDigest);
  const search = options.searchAdapters ? createSearchHandler({
    catalogRevision: manifest.catalogRevision, adapters: options.searchAdapters, now, semanticBudgetScope: options.semanticBudgetScope,
  }) : undefined;

  function finish(response: Response, env: Env, request: Request): Response {
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Catalog-Revision', manifest.catalogRevision);
    if (env.ENVIRONMENT !== 'production') {
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      headers.set('Cache-Control', 'private, no-store');
      headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
      headers.set('CDN-Cache-Control', 'no-store');
      // Defense in depth: exported staging HTML must also omit analytics keys.
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https://m.media-amazon.com https://images-na.ssl-images-amazon.com https://i.etsystatic.com; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'");
    }
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
  }

  async function asset(request: Request, env: Env, route: CatalogAssetRoute, forceSafe = false): Promise<Response> {
    const deadline = expiry(route);
    const safe = forceSafe || route.state === 'held' || !Number.isFinite(deadline) && deadline !== Infinity || deadline <= now();
    const url = new URL(request.url);
    url.pathname = safe ? route.safeAssetPath : route.assetPath;
    url.search = '';
    // Do not forward conditional headers that could turn an expired asset into 304.
    const response = await env.ASSETS.fetch(new Request(url, { method: 'GET' }));
    if (!response.ok) return json({ error: 'Page unavailable' }, 503);
    // An asset lookup can cross its deadline; never return its now-expired body.
    if (!safe && deadline <= now()) return asset(request, env, route, true);
    const headers = new Headers(response.headers);
    const seconds = safe ? 0 : Math.max(0, Math.min(300, Math.floor((deadline - now()) / 1000)));
    const cache = safe ? 'no-store' : `public, max-age=${seconds}, s-maxage=${seconds}, must-revalidate`;
    headers.set('Cache-Control', cache);
    headers.set('Cloudflare-CDN-Cache-Control', cache);
    headers.set('CDN-Cache-Control', cache);
    headers.delete('Age');
    if (safe || route.indexable === false || new URL(request.url).searchParams.has('q')) headers.set('X-Robots-Tag', 'noindex, follow');
    return new Response(response.body, { status: response.status, headers });
  }

  function sitemap(request: Request): Response {
    const origin = options.canonicalOrigin || new URL(request.url).origin;
    const entries = [...routes.entries()].filter(([path, route]) => (
      route.state === 'ready' && route.indexable !== false && expiry(route) > now()
      && !path.includes('.') && !path.startsWith('/data/') && path !== '/weird-gift-index/data'
      && !path.startsWith('/catalog/') && !path.startsWith('/_') && (path === '/' || !path.endsWith('/'))
    ));
    const deadlines = entries.map(([, route]) => expiry(route));
    const seconds = Math.max(0, Math.min(300, Math.floor((Math.min(...deadlines) - now()) / 1000)));
    const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(([path]) => `<url><loc>${escapeXml(new URL(path, origin).href)}</loc></url>`).join('')}</urlset>`;
    return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${seconds}, s-maxage=${seconds}, must-revalidate` } });
  }

  async function feed(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    let body: { seed?: unknown; limit?: unknown; excludeIds?: unknown };
    try {
      const parsed = await boundedJson(request);
      body = parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return json({ error: 'Request too large' }, 413); }
    const guard = routes.get('/');
    if (!preparedFeed || !guard || guard.state === 'held' || !(expiry(guard) > now())) return json({ error: 'Catalog temporarily unavailable' }, 503);
    const seed = (typeof body.seed === 'string' ? body.seed : 'goose-gifts').slice(0, 80);
    const limit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.max(1, Math.min(36, Math.floor(body.limit))) : 24;
    const excluded = new Set((Array.isArray(body.excludeIds) ? body.excludeIds : []).filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 100).slice(0, 1200));
    const selection = preparedFeed.select(seed, limit, excluded, now());
    if (!selection || !(Math.min(expiry(guard), preparedFeed.expiresAt) > now())) return json({ error: 'Catalog temporarily unavailable' }, 503);
    return json({ products: selection.products, hasMore: selection.hasMore });
  }

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const respond = (response: Response) => finish(response, env, request);
      try {
        if (env.ENVIRONMENT !== 'production') {
          if (!env.STAGING_AUTH_SECRET || env.STAGING_AUTH_SECRET.length < 16) return respond(json({ error: 'Staging protection unavailable' }, 503));
          const expected = await sha256(`Basic ${btoa(`staging:${env.STAGING_AUTH_SECRET}`)}`);
          const actual = await sha256(request.headers.get('Authorization') || '');
          let difference = 0;
          for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
          if (difference) return respond(json({ error: 'Authentication required' }, 401, { 'WWW-Authenticate': 'Basic realm="Stupid Gifts staging", charset="UTF-8"' }));
        }
        const url = new URL(request.url);
        const path = url.pathname;
        // Never let ASSETS decode separators/traversal differently from this dispatcher.
        if (/%(?:2f|5c|25)/i.test(path)) return respond(json({ error: 'Not found' }, 404));
        let decodedPath: string;
        try { decodedPath = decodeURIComponent(path); }
        catch { return respond(json({ error: 'Not found' }, 404)); }
        if (path === '/.well-known/catalog-release.json') {
          if (!['GET', 'HEAD'].includes(request.method)) return respond(json({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD' }));
          if (!releaseIdentity) return respond(json({ error: 'Release identity unavailable' }, 503));
          return respond(json(releaseIdentity));
        }
        if (path === '/api/search-products') return respond(search ? await search(request, env) : json({ error: 'Search unavailable' }, 503));
        if (path === '/api/catalog-feed') return respond(await feed(request));
        if (RETIRED_ROUTE.test(path) || path.startsWith('/api/')) return respond(json({ error: 'Not found' }, 404));
        if (!['GET', 'HEAD'].includes(request.method)) return respond(json({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD' }));
        if ((decodedPath === '/random-gift' || decodedPath === '/random-gift/') && url.searchParams.has('gift')) return respond(json({ error: 'Not found' }, 404));
        if (path.endsWith('/') && path !== '/') {
          const target = path.slice(0, -1);
          // Only finite known HTML pages (plus maintained legal/search pages),
          // never API, unknown assets, data aliases or a catch-all SPA redirect.
          const page = routes.get(target);
          if (target === '/privacy' || target === '/search' || !target.includes('.') && (page?.assetPath === `${target}.html`
            || page?.state === 'held' && heldProductPaths.has(target))) {
            if (target === '/gifts' && url.searchParams.has('page') && boundedDirectoryPage(url.searchParams.get('page')!, lastDirectoryPage) === null)
              return respond(json({ error: 'Not found' }, 404));
            return respond(new Response(null, { status: 308, headers: { Location: `${target}${pageAliasSearch(url.searchParams)}`, 'Cache-Control': 'no-store' } }));
          }
        }
        if (path === '/search') {
          const q = url.searchParams.get('q')?.trim();
          return respond(new Response(null, { status: 308, headers: { Location: q ? `/?q=${encodeURIComponent(q)}` : '/', 'Cache-Control': 'no-store' } }));
        }
        if (path === '/gifts' && url.searchParams.has('page')) {
          const value = url.searchParams.get('page')!;
          const page = boundedDirectoryPage(value, lastDirectoryPage);
          if (page === null) return respond(json({ error: 'Not found' }, 404));
          const target = page === 1 ? '/gifts' : `/gifts/page/${page}`;
          if (!routes.has(target)) return respond(json({ error: 'Not found' }, 404));
          url.pathname = target;
          return respond(new Response(null, { status: 308, headers: { Location: `${url.pathname}${campaignSearch(url.searchParams)}`, 'Cache-Control': 'no-store' } }));
        }
        const directory = path.match(/^\/gifts\/page\/([1-9]\d*)$/);
        if (directory) {
          const page = boundedDirectoryPage(directory[1], lastDirectoryPage);
          if (page === null) return respond(json({ error: 'Not found' }, 404));
          const target = page === 1 ? '/gifts' : `/gifts/page/${page}`;
          if (target !== path) return respond(new Response(null, { status: 308, headers: { Location: `${target}${campaignSearch(url.searchParams)}`, 'Cache-Control': 'no-store' } }));
        }
        const redirect = redirects.get(path);
        if (redirect && routes.has(redirect)) return respond(new Response(null, { status: 308, headers: { Location: `${redirect}${campaignSearch(url.searchParams)}`, 'Cache-Control': 'no-store' } }));
        if (path === '/sitemap.xml' || path === '/sitemap/0.xml') return respond(sitemap(request));
        // Retained chunks may arrive with encoded brackets or unreserved filename
        // bytes. Their single-decoded equivalent must not bypass the expiry guard.
        const route = routes.get(path) || directAssets.get(path) || routes.get(decodedPath) || directAssets.get(decodedPath);
        if (route) return respond(await asset(request, env, route));
        // Legal content is timeless and intentionally outside catalog manifests.
        if (path === '/privacy' || /^\/privacy(?:\.(?:html|txt)|\/__next\.[^/]+\.txt)$/.test(path)) {
          const assetPath = path === '/privacy' ? '/privacy.html' : path;
          return respond(await asset(request, env, { assetPath, safeAssetPath: assetPath, eligibleUntil: null, state: 'ready', indexable: path === '/privacy' }));
        }
        if (safeAssets.has(path)) {
          const safeRoute = [...routes.values()].find((entry) => entry.safeAssetPath === path)!;
          return respond(await asset(request, env, safeRoute, true));
        }
        // Unknown freshness-sensitive paths are real 404s, never asset/SPA fallback.
        if (TIMED_ROUTE.test(path) || !PUBLIC_ASSET.test(path)) return respond(json({ error: 'Not found' }, 404));
        const response = await env.ASSETS.fetch(request);
        return respond(response.status === 404 ? json({ error: 'Not found' }, 404) : response);
      } catch {
        // No error object: it may contain provider credentials, queries or URLs.
        return respond(json({ error: 'Temporarily unavailable' }, 503));
      }
    },
  };
}
