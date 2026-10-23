#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { readPinterestCatalog } from './pinterest-catalog.mts';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  areNearDuplicateTitles,
  isCatalogDisplayEligibleProduct,
  scoreProductForTrending,
  suppressNearDuplicateProducts,
} from '../../lib/db/product-scoring.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'docs/ops/pinterest-approved-pins.json');
const creativeEventsPath = path.join(root, 'docs/ops/marketing-experiments/events.jsonl');
const ASIN_PATTERN = /\b(?=[A-Z0-9]{10}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{10}\b/g;
const PURCHASABLE = new Set(['IN_STOCK', 'IN_STOCK_SCARCE', 'INSTOCKSCARCE', 'AVAILABLE_DATE', 'LEADTIME', 'PREORDER']);

export function usedPinterestProductIds({ manifest, events }) {
  const ids = new Set<string>();
  for (const pin of manifest.pins || []) {
    if (!pin.livePinUrl || pin.publicationStatus === 'deleted') continue;
    for (const match of JSON.stringify(pin).match(ASIN_PATTERN) || []) ids.add(match);
  }

  const published = new Set<string>();
  for (const event of events) {
    if (event.type === 'candidate.status_changed' && event.data.to === 'published') {
      published.add(event.data.candidateId);
    }
  }
  for (const event of events) {
    if (!published.has(event.data?.candidateId)) continue;
    for (const match of JSON.stringify(event).match(ASIN_PATTERN) || []) ids.add(match);
  }
  return ids;
}

export function usedPinterestProductTitles(events) {
  const published = new Set<string>();
  for (const event of events) {
    if (event.type === 'candidate.status_changed' && event.data.to === 'published') {
      published.add(event.data.candidateId);
    }
  }
  return events
    .filter((event) => event.type === 'candidate.created' && published.has(event.data.candidateId))
    .map((event) => event.data.product?.name)
    .filter(Boolean);
}

export function selectPinterestSourceCandidates(
  rows,
  usedIds = new Set<string>(),
  limit = 20,
  now = new Date(),
  usedTitles: string[] = [],
  latestRunIds = new Set<string>(),
) {
  const maxAgeMs = 35 * 24 * 60 * 60 * 1000;
  const eligible = rows.filter((row) => {
    const verifiedAt = new Date(row.availability_checked_at || row.last_verified_at || 0).getTime();
    const title = String(row.title || '');
    const product = {
      ...row,
      imageUrl: row.image_url,
      affiliateUrl: row.affiliate_url,
      qualityScore: Number(row.quality_score || 0),
      price: Number(row.price || 0),
      sourceQuery: row.source_query || '',
      humorTags: row.humor_tags || [],
      rating: row.rating ? Number(row.rating) : undefined,
      reviewCount: row.review_count || undefined,
      isActive: row.is_active,
    };

    return !usedIds.has(row.id)
      && !usedTitles.some((usedTitle) => areNearDuplicateTitles(title, usedTitle))
      && row.source === 'amazon'
      && row.is_active === true
      && !row.duplicate_of_product_id
      && ['generated_ready', 'manual_locked'].includes(row.editorial_status)
      && Number(row.editorial_quality_score || 0) >= 0.8
      && Boolean(row.source_facts_hash)
      && row.source_facts_hash === row.editorial_source_hash
      && PURCHASABLE.has(String(row.availability_status || '').toUpperCase())
      && Number.isFinite(verifiedAt)
      && verifiedAt <= now.getTime()
      && now.getTime() - verifiedAt <= maxAgeMs
      && !title.includes('...')
      && !title.includes('…')
      && isCatalogDisplayEligibleProduct(product);
  }).map((row) => ({
    ...row,
    pinterestScore: scoreProductForTrending({
      ...row,
      imageUrl: row.image_url,
      affiliateUrl: row.affiliate_url,
      qualityScore: Number(row.quality_score || 0),
      price: Number(row.price || 0),
      sourceQuery: row.source_query || '',
      humorTags: row.humor_tags || [],
      rating: row.rating ? Number(row.rating) : undefined,
      reviewCount: row.review_count || undefined,
      isActive: row.is_active,
    })
      + Math.round(Number(row.editorial_quality_score || 0) * 20)
      + (latestRunIds.has(row.id) ? 8 : 0),
  })).sort((left, right) => (
    right.pinterestScore - left.pinterestScore
    || new Date(right.editorial_generated_at || 0).getTime() - new Date(left.editorial_generated_at || 0).getTime()
    || Number(right.quality_score || 0) - Number(left.quality_score || 0)
    || String(left.id).localeCompare(String(right.id))
  ));

  return suppressNearDuplicateProducts(eligible.map((row) => ({ ...row, title: row.title })), limit);
}

function parseArgs(argv: string[]) {
  const options = { limit: 20, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--json') options.json = true;
    else if (argv[index] === '--limit') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('--limit must be an integer from 1 to 100.');
      options.limit = value;
    } else if (argv[index] === '--help' || argv[index] === '-h') {
      console.log('Usage: npm run pinterest:candidates -- [--limit 20] [--json]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function loadJsonLines(filePath: string) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { rows, latestCatalogRun, latestRunIds, ...catalogEvidence } = await readPinterestCatalog();

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const events = loadJsonLines(creativeEventsPath);
  const usedIds = usedPinterestProductIds({ manifest, events });
  const usedTitles = usedPinterestProductTitles(events);
  const candidates = selectPinterestSourceCandidates(
    rows,
    usedIds,
    options.limit,
    new Date(),
    usedTitles,
    latestRunIds,
  ).map((row) => ({
    productId: row.id,
    title: row.title,
    productPage: `https://stupid.gifts/gifts/${row.slug}`,
    sourceImage: row.image_url,
    price: Number(row.price || 0),
    qualityScore: Number(row.quality_score || 0),
    editorialQualityScore: Number(row.editorial_quality_score || 0),
    pinterestScore: row.pinterestScore,
    seenInLatestCatalogRun: latestRunIds.has(row.id),
    lastVerifiedAt: row.availability_checked_at || row.last_verified_at,
    editorialGeneratedAt: row.editorial_generated_at,
    humorTags: row.humor_tags || [],
    sourceFacts: row.source_facts || {},
  }));
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'live Stupid.gifts publication-bound D1 catalog; read-only; not permission to generate or publish',
    catalogEvidence,
    latestCatalogRun,
    alreadyPublishedProductIds: [...usedIds].sort(),
    candidates,
  };

  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Pinterest source candidates: ${candidates.length} (latest catalog run ${payload.latestCatalogRun?.id || 'none'})`);
    candidates.forEach((candidate, index) => {
      console.log(`${index + 1}. ${candidate.productId} | score ${candidate.pinterestScore} | ${candidate.title}`);
      console.log(`   ${candidate.productPage}`);
    });
  }
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().catch((error) => {
    console.error(`pinterest-candidates: ${error.message}`);
    process.exitCode = 1;
  });
}
