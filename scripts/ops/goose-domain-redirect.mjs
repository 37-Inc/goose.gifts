import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const OLD_HOSTS = ['goose.gifts', 'www.goose.gifts'];
export const NEW_ORIGIN = 'https://stupid.gifts';
export function redirectTarget(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || !OLD_HOSTS.includes(url.hostname) || url.port || url.username || url.password) return null;
  return `${NEW_ORIGIN}${url.pathname}${url.search}`;
}

async function read(url, method = 'GET') {
  const response = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const body = method === 'GET' ? await response.text() : '';
  if (Buffer.byteLength(body) > 5_000_000) throw new Error('Public response exceeded audit bound');
  return { url, status: response.status, location: response.headers.get('location'),
    server: response.headers.get('server'), canonical: body.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1] ?? null,
    robots: response.headers.get('x-robots-tag') ?? body.match(/<meta\b[^>]*name="robots"[^>]*content="([^"]+)"/)?.[1] ?? null,
    body };
}
async function pool(items, worker, concurrency = 4) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) { const index = next++; if (index >= items.length) return; results[index] = await worker(items[index]); }
  }));
  return results;
}
const unescapeXml = text => text.replaceAll('&amp;', '&');
export async function audit(stage) {
  if (!['before', 'after'].includes(stage)) throw new Error('Stage must be before or after');
  const root = path.resolve(import.meta.dirname, '../..');
  const pins = JSON.parse(await fs.readFile(path.join(root, 'docs/ops/pinterest-cutover-2026-10-23/verification/retained-destinations.json'), 'utf8')).items;
  if (pins.length !== 28 || new Set(pins.map(pin => pin.pinId)).size !== 28) throw new Error('Retained Pin inventory mismatch');
  const identity = await read(`${NEW_ORIGIN}/.well-known/catalog-release.json`);
  if (identity.status !== 200) throw new Error('New production release unavailable');
  const [oldSitemap, newSitemap] = await Promise.all([read('https://www.goose.gifts/sitemap.xml'), read(`${NEW_ORIGIN}/sitemap.xml`)]);
  const sitemapPaths = [...new Set([...oldSitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g), ...newSitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(match => new URL(unescapeXml(match[1])).pathname))].sort();
  if (sitemapPaths.length > 1000) throw new Error('Sitemap inventory exceeds reviewed bound');
  const probes = ['/', '/privacy', '/random-gift', '/gift-guides', '/gifts', '/search?q=funny%20desk&utm_source=redirect_qa',
    '/missing-redirect-qa-20261023', '/bundles/retired', '/weird-gift-index', '/random-gift?gift=retired-id'];
  const matrix = await pool(OLD_HOSTS.flatMap(host => ['http:', 'https:'].flatMap(protocol => probes.map(route => `${protocol}//${host}${route}`))), async url => {
    const old = await read(url, 'HEAD');
    return { ...old, body: undefined, expected: redirectTarget(url), matches: old.status === 301 && old.location === redirectTarget(url) };
  });
  const destinations = await pool(probes, async route => {
    const response = await read(`${NEW_ORIGIN}${route}`, 'HEAD');
    const expectedStatus = route.startsWith('/search?') ? 308
      : ['/missing-', '/bundles/', '/weird-gift-index', '/random-gift?gift='].some(prefix => route.startsWith(prefix)) ? 404 : 200;
    return { ...response, body: undefined, expectedStatus, matches: response.status === expectedStatus };
  });
  const pinResults = await pool(pins, async pin => {
    const old = await read(pin.oldSite.requested, 'HEAD'); const target = redirectTarget(pin.oldSite.requested);
    const current = await read(target);
    const retailer = current.body.match(/https:\/\/www\.amazon\.com\/dp\/([A-Z0-9]{10})/)?.[1] ?? null;
    return { pinId: pin.pinId, old: { ...old, body: undefined }, target, current: { ...current, body: undefined },
      redirectMatches: old.status === 301 && old.location === target,
      retailerProductId: retailer, previousRetailerProductId: pin.newSite.retailerProductId,
      retailerMatchesPriorAudit: retailer !== null && retailer === pin.newSite.retailerProductId,
      intentionalHold: pin.pinId === '1107815208387817822' };
  });
  const routes = await pool(sitemapPaths, async pathname => {
    const target = `${NEW_ORIGIN}${pathname}`;
    const response = await read(target, 'HEAD');
    return { pathname, status: response.status, location: response.location };
  });
  const stripBody = value => { const result = { ...value }; delete result.body; return result; };
  return { stage, observedAt: new Date().toISOString(), publicReadsOnly: true, writes: 0,
    releaseIdentity: JSON.parse(identity.body), oldSitemap: stripBody(oldSitemap), newSitemap: stripBody(newSitemap),
    sitemapPaths, routes, matrix, destinations, pins: pinResults,
    summary: { sitemapPaths: sitemapPaths.length, target200: routes.filter(row => row.status === 200).length,
      targetOther: routes.filter(row => row.status !== 200), pinCount: pinResults.length,
      pins200: pinResults.filter(pin => pin.current.status === 200).length,
      pinRedirectsCorrect: pinResults.filter(pin => pin.redirectMatches).length,
      matrixCorrect: matrix.filter(row => row.matches).length, matrixCount: matrix.length,
      destinationsCorrect: destinations.filter(row => row.matches).length, destinationCount: destinations.length },
    caveats: ['Tagged curl/HEAD verification is operator QA, not acquisition. No browser analytics events are generated.',
      'Identical path redirect does not reactivate held or retired pages. Unknown/retired destinations retain the new site 404.',
      'No Pin IDs, packages, UTM approvals or publication receipts are rewritten.'] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [stage, output] = process.argv.slice(2);
  if (!output || !['before', 'after'].includes(stage) || process.argv.length !== 4) throw new Error('Usage: node scripts/ops/goose-domain-redirect.mjs before|after NEW-EVIDENCE.json');
  const result = await audit(stage);
  await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, ...result.summary }));
  if (stage === 'after' && (result.summary.pinRedirectsCorrect !== 28 || result.summary.matrixCorrect !== result.summary.matrixCount
    || result.summary.destinationsCorrect !== result.summary.destinationCount)) process.exitCode = 1;
}
