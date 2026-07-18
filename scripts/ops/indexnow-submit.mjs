#!/usr/bin/env node
/**
 * IndexNow submission for goose.gifts.
 *
 * IndexNow lets us notify participating search engines (Bing, Yandex, Naver,
 * Seznam, Yep, …) that URLs are new/updated so they re-crawl sooner. It does
 * NOT feed Google — Google does not consume IndexNow. Acceptance by the API is a
 * *receipt* that the notification was queued; it is NOT a guarantee of crawling
 * or indexing.
 *
 * Auth is the public key file hosted at the site root
 * (`public/<key>.txt`) — this script auto-discovers it, so there is no secret to
 * manage. We submit only canonical, public www URLs (sourced from the live
 * sitemap by default), never admin/api/non-canonical routes.
 *
 * Usage:
 *   node scripts/ops/indexnow-submit.mjs                 # submit all sitemap URLs (seed)
 *   node scripts/ops/indexnow-submit.mjs --dry-run       # print payload, do NOT send (safe rehearsal)
 *   node scripts/ops/indexnow-submit.mjs --url https://www.goose.gifts/gift-guides/funny-gifts-for-dads
 *   node scripts/ops/indexnow-submit.mjs --url <u> --url <u> --dry-run
 *   node scripts/ops/indexnow-submit.mjs --endpoint https://www.bing.com/indexnow   # override engine
 *
 * Rollback / disable: this is a manual, on-demand tool — nothing runs it
 * automatically, so "disabling" is simply not invoking it. To stop IndexNow
 * entirely, remove the key file `public/<key>.txt` (submissions then fail the
 * key check at the engine). `--dry-run` never contacts any engine.
 *
 * Guardrail: do NOT wire this to fire the whole sitemap on every deploy. Seed
 * once, then submit only the specific URLs that were created / materially
 * changed / deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOST = 'www.goose.gifts';
const ORIGIN = `https://${HOST}`;
const SITEMAP_URL = `${ORIGIN}/sitemap.xml`;
const DEFAULT_ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS_PER_REQUEST = 10000; // IndexNow protocol limit

function parseArgs(argv) {
  const urls = [];
  let dryRun = false;
  let endpoint = DEFAULT_ENDPOINT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--url') urls.push(argv[(i += 1)]);
    else if (arg === '--endpoint') endpoint = argv[(i += 1)];
    else if (arg.startsWith('http')) urls.push(arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return { urls: urls.filter(Boolean), dryRun, endpoint };
}

// Auto-discover the public IndexNow key file: a 32-hex-char .txt in public/
// whose contents match its own basename (that is the IndexNow convention).
function discoverKey() {
  const publicDir = path.join(ROOT, 'public');
  const candidates = fs
    .readdirSync(publicDir)
    .filter((name) => /^[a-f0-9]{8,}\.txt$/i.test(name));

  for (const name of candidates) {
    const key = name.replace(/\.txt$/i, '');
    const contents = fs.readFileSync(path.join(publicDir, name), 'utf8').trim();
    if (contents === key) {
      return { key, keyLocation: `${ORIGIN}/${name}` };
    }
  }

  throw new Error(
    'No valid IndexNow key file found in public/. Expected a <key>.txt whose contents equal <key>.'
  );
}

async function fetchSitemapUrls() {
  const response = await fetch(SITEMAP_URL, {
    headers: { 'User-Agent': 'goose.gifts-indexnow/1.0' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap ${SITEMAP_URL}: HTTP ${response.status}`);
  }
  const xml = await response.text();
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
  if (locs.length === 0) {
    throw new Error('Sitemap contained no <loc> URLs.');
  }
  return locs;
}

// Only submit canonical, public URLs on our own host. This is the guard that
// keeps admin/api/preview/non-canonical URLs out of IndexNow.
function sanitizeUrls(rawUrls) {
  const seen = new Set();
  const kept = [];
  const rejected = [];

  for (const raw of rawUrls) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      rejected.push([raw, 'unparseable']);
      continue;
    }
    if (url.protocol !== 'https:') rejected.push([raw, 'not https']);
    else if (url.hostname !== HOST) rejected.push([raw, `host is not ${HOST}`]);
    else if (/^\/(api|admin)(\/|$)/.test(url.pathname)) rejected.push([raw, 'admin/api route']);
    else if (seen.has(url.href)) {
      /* duplicate, silently skip */
    } else {
      seen.add(url.href);
      kept.push(url.href);
    }
  }

  return { kept, rejected };
}

async function submitBatch(endpoint, key, keyLocation, urlList) {
  const body = JSON.stringify({ host: HOST, key, keyLocation, urlList });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
    },
    body,
  });
  const text = await response.text();
  return { status: response.status, ok: response.ok, body: text };
}

async function main() {
  const { urls, dryRun, endpoint } = parseArgs(process.argv.slice(2));
  const { key, keyLocation } = discoverKey();

  const source = urls.length > 0 ? urls : await fetchSitemapUrls();
  const { kept, rejected } = sanitizeUrls(source);

  console.log(`IndexNow submission for ${HOST}`);
  console.log(`  endpoint:     ${endpoint}`);
  console.log(`  keyLocation:  ${keyLocation}`);
  console.log(`  source:       ${urls.length > 0 ? 'explicit --url args' : SITEMAP_URL}`);
  console.log(`  URLs to send: ${kept.length}`);
  if (rejected.length > 0) {
    console.log(`  skipped (${rejected.length}):`);
    for (const [u, why] of rejected) console.log(`    - ${u}  (${why})`);
  }

  if (kept.length === 0) {
    console.error('Nothing to submit. Aborting.');
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n[dry-run] Would POST this payload (not sending):');
    console.log(JSON.stringify({ host: HOST, key: `${key.slice(0, 6)}…`, keyLocation, urlList: kept }, null, 2));
    console.log('\n[dry-run] No request sent. Remove --dry-run to submit.');
    return;
  }

  let anyFailed = false;
  for (let i = 0; i < kept.length; i += MAX_URLS_PER_REQUEST) {
    const chunk = kept.slice(i, i + MAX_URLS_PER_REQUEST);
    const result = await submitBatch(endpoint, key, keyLocation, chunk);
    // 200 OK and 202 Accepted both mean "received" per the IndexNow spec.
    const accepted = result.status === 200 || result.status === 202;
    console.log(
      `\n${accepted ? '✓ accepted' : '✗ rejected'}  HTTP ${result.status}  (${chunk.length} URLs)`
    );
    if (result.body) console.log(`  response body: ${result.body || '(empty)'}`);
    if (!accepted) anyFailed = true;
  }

  console.log(
    '\nNote: acceptance is a receipt that the notification was queued, NOT a guarantee ' +
      'of crawl or indexing. Google does not use IndexNow (Bing/Yandex/others do).'
  );

  if (anyFailed) process.exit(1);
}

main().catch((error) => {
  console.error('IndexNow submission failed:', error.message);
  process.exit(1);
});
