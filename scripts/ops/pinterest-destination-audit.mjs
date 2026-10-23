#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalizeUrl } from './pinterest-publishing.mjs';

/** Does not edit Pins or implement redirects. No homepage fallback or retailer fetch. */
export async function auditPinterestDestination(value, send = fetch) {
  let url = new URL(value); const requested = url.href;
  const hops = [];
  for (let index = 0; index < 6; index++) {
    if (url.protocol !== 'https:' || !['goose.gifts', 'www.goose.gifts', 'stupid.gifts'].includes(url.hostname))
      throw new Error('destination_audit_unexpected_origin');
    const response = await send(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    hops.push({ url: url.href, status: response.status });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('destination_audit_missing_location');
      url = new URL(location, url); continue;
    }
    const html = await response.text();
    if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error('destination_audit_response_bound');
    const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1] || null;
    const productIds = [...html.matchAll(/data-analytics-id="([^"]+)"/g)].map(match => match[1]);
    const retailerProductId = html.match(/id="gift-retailer-primary"[^]*?<a[^>]*href="[^"]*\/dp\/([A-Z0-9]{10})/i)?.[1]
      || html.match(/data-analytics-outbound[^>]*href="[^"]*\/dp\/([A-Z0-9]{10})/i)?.[1]
      || html.match(/href="https:\/\/www\.amazon\.com\/dp\/([A-Z0-9]{10})[^>]*data-analytics-outbound/i)?.[1] || null;
    const original = new URL(requested);
    return { requested, finalUrl: url.href, status: response.status, canonical, hops,
      utmPreserved: [...original.searchParams].filter(([key]) => key.startsWith('utm_')).every(([key, val]) => url.searchParams.get(key) === val),
      samePath: url.pathname === original.pathname, productIds: [...new Set(productIds)], retailerProductId,
      robots: html.match(/<meta[^>]*name="robots"[^>]*content="([^"]+)"/i)?.[1] || null,
      title: html.match(/<title>([^<]+)<\/title>/i)?.[1] || null };
  }
  throw new Error('destination_audit_redirect_bound');
}

async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/ops/pinterest-destination-audit.mjs <measurement-receipt.json>');
  const report = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/ops/pinterest-approved-pins.json'), 'utf8'));
  const items = [];
  // Sequential product pairs, not 56 simultaneous site requests.
  for (const pin of report.metrics.pins) {
    const original = new URL(pin.link); const next = new URL(pin.link); next.hostname = 'stupid.gifts';
    const draft = manifest.pins.find(item => item.livePinUrl?.includes(`/pin/${pin.id}`));
    const packageLinkMatches = draft ? canonicalizeUrl(draft.trackingUrl) === canonicalizeUrl(pin.link) : null;
    const [oldSite, newSite] = await Promise.all([auditPinterestDestination(original.href), auditPinterestDestination(next.href)]);
    const matchingProduct = oldSite.retailerProductId && newSite.retailerProductId
      ? oldSite.retailerProductId === newSite.retailerProductId : null;
    items.push({ pinId: pin.id, packageLinkMatches, oldSite, newSite, matchingProduct });
  }
  console.log(JSON.stringify({ auditedAt: new Date().toISOString(), count: items.length, publicWrites: 0,
    summary: { oldSite200: items.filter(item => item.oldSite.status === 200).length,
      newSite200: items.filter(item => item.newSite.status === 200).length,
      oldSiteRedirectsToNewSite: items.filter(item => new URL(item.oldSite.finalUrl).hostname === 'stupid.gifts').length,
      matchingProducts: items.filter(item => item.matchingProduct === true).length,
      unchangedApprovedLinks: items.filter(item => item.packageLinkMatches === true).length }, items }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
