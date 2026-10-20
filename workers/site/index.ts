import type { CatalogAssetRoute, CatalogSnapshot, SiteAssetManifest } from '../../lib/catalog/types.ts';
import type { SearchAdapters, SiteEnv } from './bindings.ts';
import { prepareStaticFeed } from './feed.ts';
import { createSearchHandler, json, sha256 } from './search.ts';

export type { SiteEnv, SearchAdapters, SearchStorage } from './bindings.ts';

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

function campaignSearch(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid']) {
    const value = params.get(key);
    if (value && /^[a-zA-Z0-9._~:-]{1,200}$/.test(value)) kept.set(key, value);
  }
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
  const preparedFeed = prepareStaticFeed(snapshot.products, now());
  const search = options.searchAdapters ? createSearchHandler({
    catalogRevision: manifest.catalogRevision, adapters: options.searchAdapters, now,
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
    if (!guard || guard.state === 'held' || !(expiry(guard) > now())) return json({ error: 'Catalog temporarily unavailable' }, 503);
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
        if (path === '/api/search-products') return respond(search ? await search(request, env) : json({ error: 'Search unavailable' }, 503));
        if (path === '/api/catalog-feed') return respond(await feed(request));
        if (RETIRED_ROUTE.test(path) || path.startsWith('/api/')) return respond(json({ error: 'Not found' }, 404));
        if (!['GET', 'HEAD'].includes(request.method)) return respond(json({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD' }));
        if (path === '/search') {
          const q = url.searchParams.get('q')?.trim();
          return respond(new Response(null, { status: 308, headers: { Location: q ? `/?q=${encodeURIComponent(q)}` : '/', 'Cache-Control': 'no-store' } }));
        }
        if (path === '/random-gift' && url.searchParams.has('gift')) return respond(json({ error: 'Not found' }, 404));
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
        const route = routes.get(path) || directAssets.get(path);
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
