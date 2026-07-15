#!/usr/bin/env node

import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { sql } from '@vercel/postgres';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const DEFAULT_THEMES = [
  'funny white elephant gifts',
  'gag gifts for coworkers',
  'weird kitchen gadgets',
  'prank gifts for friends',
  'funny gifts for dads',
  'novelty desk toys',
  'ridiculous pet gifts',
  'sarcastic coffee mugs',
  'bizarre home decor',
  'oddball stocking stuffers',
  'funny birthday gifts',
  'gag gifts under 25 dollars',
];

const PAAPI_GET_ITEMS_TARGET = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
const PAAPI_SEARCH_TARGET = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';

const HUMOR_TAG_RULES = [
  ['white elephant', ['white-elephant', 'party']],
  ['coworker office desk meeting boss', ['office-safe', 'desk']],
  ['pet dog cat pug', ['pets']],
  ['kitchen mug coffee', ['kitchen', 'coffee']],
  ['dad father', ['dad-joke']],
  ['prank fake gag', ['prank', 'gag']],
  ['weird bizarre oddball ridiculous novelty', ['weird', 'novelty']],
  ['sarcastic snarky', ['sarcastic']],
  ['birthday', ['birthday']],
  ['stocking christmas holiday', ['holiday']],
];

function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    maxNew: Number(process.env.CATALOG_PREFETCH_MAX_NEW || 50),
    perTheme: Number(process.env.CATALOG_PREFETCH_PER_THEME || 10),
    themeLimit: Number(process.env.CATALOG_PREFETCH_THEMES || 6),
    minPrice: Number(process.env.CATALOG_MIN_PRICE || 5),
    maxPrice: Number(process.env.CATALOG_MAX_PRICE || 150),
    skipEnrichment: false,
    enrichOnly: false,
    enrichmentBatchSize: Number(process.env.CATALOG_ENRICH_BATCH_SIZE || 12),
    backfillLimit: Number(process.env.CATALOG_ENRICH_EXISTING_LIMIT || 25),
    revalidate: false,
    revalidateLimit: Number(process.env.CATALOG_REVALIDATE_LIMIT || 50),
    staleDays: Number(process.env.CATALOG_REVALIDATE_STALE_DAYS || 30),
    deactivateAfterDays: Number(process.env.CATALOG_DEACTIVATE_AFTER_DAYS || 90),
    deactivateMissing: true,
    themes: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--max-new') options.maxNew = Number(argv[++index]);
    else if (arg === '--per-theme') options.perTheme = Number(argv[++index]);
    else if (arg === '--theme-limit') options.themeLimit = Number(argv[++index]);
    else if (arg === '--min-price') options.minPrice = Number(argv[++index]);
    else if (arg === '--max-price') options.maxPrice = Number(argv[++index]);
    else if (arg === '--skip-enrichment') options.skipEnrichment = true;
    else if (arg === '--enrich-only') options.enrichOnly = true;
    else if (arg === '--enrichment-batch-size') options.enrichmentBatchSize = Number(argv[++index]);
    else if (arg === '--backfill-limit') options.backfillLimit = Number(argv[++index]);
    else if (arg === '--revalidate') options.revalidate = true;
    else if (arg === '--revalidate-limit') options.revalidateLimit = Number(argv[++index]);
    else if (arg === '--stale-days') options.staleDays = Number(argv[++index]);
    else if (arg === '--deactivate-after-days') options.deactivateAfterDays = Number(argv[++index]);
    else if (arg === '--no-deactivate') options.deactivateMissing = false;
    else if (arg === '--themes') {
      options.themes = argv[++index]
        .split('|')
        .map((theme) => theme.trim())
        .filter(Boolean);
    }
  }

  options.revalidateLimit = Math.max(1, Math.min(100, Math.floor(options.revalidateLimit || 50)));
  options.staleDays = Math.max(1, Math.floor(options.staleDays || 30));
  options.deactivateAfterDays = Math.max(
    60,
    options.staleDays,
    Math.floor(options.deactivateAfterDays || 90)
  );

  return options;
}

function printHelp() {
  console.log(`Usage: npm run catalog:prefetch -- [options]

Options:
  --dry-run                 Search and score products without writing to Postgres.
  --themes "a|b|c"          Pipe-delimited discovery themes.
  --theme-limit 6           Number of themes to search.
  --per-theme 10            Google CSE results per theme, max 10.
  --max-new 50              Stop after this many net-new products.
  --min-price 5             Minimum known price for active homepage eligibility.
  --max-price 150           Maximum known price for active homepage eligibility.
  --skip-enrichment         Write heuristic catalog fields without OpenAI copy/embeddings.
  --enrich-only             Backfill existing active products, without discovery.
  --enrichment-batch-size 12
                            Products per OpenAI copy/tag batch.
  --backfill-limit 25       Existing active products to enrich before discovery. Set 0 to skip.
  --revalidate              Recheck a bounded batch of stale active Amazon products and repair affiliate URLs.
  --revalidate-limit 50     Maximum stale products to check (hard cap 100; PA-API batches of 10).
  --stale-days 30           Only check products not successfully verified within this many days.
  --deactivate-after-days 90
                            Deactivate only products this stale that are absent from two PA-API checks (minimum 60).
  --no-deactivate           Audit and refresh only; never deactivate missing products.
`);
}

function requiredEnv(options) {
  const env = {
    POSTGRES_URL: process.env.POSTGRES_URL,
  };

  if (!options.enrichOnly) {
    env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
    env.AWS_SECRET_KEY_OR_AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    env.AMAZON_ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG;
  }

  if (!options.enrichOnly && !options.revalidate) {
    env.GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
    env.GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
  }

  if (!options.skipEnrichment && !options.dryRun && !options.revalidate) {
    env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }

  return env;
}

function assertConfigured(options) {
  const env = requiredEnv(options);
  const required = options.dryRun && !options.revalidate
    ? Object.entries(env).filter(([key]) => key !== 'POSTGRES_URL')
    : Object.entries(env);
  const missing = Object.entries(env)
    .filter(([key]) => required.some(([requiredKey]) => requiredKey === key))
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

function utcDayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}

function selectRotatingThemes(themePool, limit, date = new Date()) {
  if (themePool.length === 0 || limit <= 0) return [];

  const count = Math.min(limit, themePool.length);
  const start = (utcDayNumber(date) * count) % themePool.length;
  return Array.from({ length: count }, (_, index) => themePool[(start + index) % themePool.length]);
}

function amazonSecretKey() {
  return process.env.AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
}

function cleanAmazonImageUrl(url) {
  if (!url) return '';

  try {
    const decoded = decodeURIComponent(url);
    const origin = new URL(url).origin;

    const compositeSource = decoded.match(/(?:^|[|])pi-src:([^|]+?\.(?:jpg|jpeg|png|webp))/i)?.[1];
    if (compositeSource) {
      return compositeSource.startsWith('http')
        ? compositeSource
        : `${origin}/images/I/${compositeSource}`;
    }

    const transformedImage = decoded.match(
      /^(https?:\/\/[^/]+\/images\/I\/[^?#]+?\.(?:jpg|jpeg|png|webp))(?:[._][^?#]*)?$/i
    );
    if (transformedImage) {
      return transformedImage[1];
    }

    const cleaned = decoded.replace(
      /\.(jpg|jpeg|png|webp)_[^?#]+\.(jpg|jpeg|png|webp)$/i,
      '.$1'
    );

    if (cleaned.includes('.jpg_') || cleaned.includes('.png_') || cleaned.includes('.webp_')) {
      const match = decoded.match(/\/images\/I\/([^._]+)\./);
      if (match) {
        const imageId = match[1];
        const ext = decoded.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'jpg';
        return `${origin}/images/I/${imageId}.${ext}`;
      }
    }

    return cleaned;
  } catch {
    return url;
  }
}

function extractAsin(url) {
  const match = url.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})/);
  return match ? match[1] || match[2] : null;
}

function cleanTitle(title) {
  return title
    .replace(/\s*[-:]\s*Amazon\.com\s*$/i, '')
    .replace(/\s*Amazon\.com\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DUPLICATE_TITLE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'for', 'gift', 'gifts', 'in', 'of', 'on', 'the', 'to', 'with',
  'funny', 'gag', 'novelty', 'unique', 'perfect', 'best', 'new',
]);

function normalizedTitleTokens(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !DUPLICATE_TITLE_STOP_WORDS.has(token));
}

function titleSimilarity(leftTitle, rightTitle) {
  const left = new Set(normalizedTitleTokens(leftTitle));
  const right = new Set(normalizedTitleTokens(rightTitle));
  if (left.size < 4 || right.size < 4) return 0;

  const intersection = Array.from(left).filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function deduplicateCandidates(products, threshold = 0.82) {
  const kept = [];
  let duplicates = 0;

  for (const product of products) {
    const duplicate = kept.some((existing) => (
      existing.id === product.id || titleSimilarity(existing.title, product.title) >= threshold
    ));
    if (duplicate) duplicates += 1;
    else kept.push(product);
  }

  return { products: kept, duplicates };
}

function deduplicateAgainstCatalog(products, catalogProducts, threshold = 0.82) {
  let duplicates = 0;
  const filtered = products.filter((product) => {
    const duplicate = catalogProducts.some((existing) => (
      existing.id !== product.id && titleSimilarity(existing.title, product.title) >= threshold
    ));
    if (duplicate) duplicates += 1;
    return !duplicate;
  });
  return { products: filtered, duplicates };
}

function amazonAffiliateUrl(asin, affiliateTag = process.env.AMAZON_ASSOCIATE_TAG || '') {
  return `https://www.amazon.com/dp/${asin}?tag=${encodeURIComponent(affiliateTag)}`;
}

function inferHumorTags(title, theme) {
  const haystack = `${title} ${theme}`.toLowerCase();
  const tags = new Set();

  for (const [words, ruleTags] of HUMOR_TAG_RULES) {
    if (words.split(' ').some((word) => haystack.includes(word))) {
      ruleTags.forEach((tag) => tags.add(tag));
    }
  }

  if (tags.size === 0) {
    tags.add('novelty');
  }

  return Array.from(tags).slice(0, 5);
}

function scoreCandidate(product) {
  const title = product.title.toLowerCase();
  let score = 0.35;
  const hasKnownPrice = product.price > 0;

  if (product.imageUrl) score += 0.15;
  if (product.price >= 8 && product.price <= 60) score += 0.15;
  else if (product.price > 60 && product.price <= 150) score += 0.05;
  else if (hasKnownPrice) score -= 0.05;
  if (/\b(funny|gag|prank|weird|novelty|ridiculous|sarcastic|silly)\b/.test(title)) score += 0.2;
  if (product.humorTags.length >= 2) score += 0.1;

  return Math.max(0.05, Math.min(0.95, Number(score.toFixed(4))));
}

let openaiClient = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  openaiClient ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openaiClient;
}

function chunkArray(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function truncateText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function fallbackPunnyTitle(product) {
  return truncateText(product.title, 78);
}

function fallbackWittyDescription(product) {
  const theme = product.sourceQuery ? `Found while hunting for ${product.sourceQuery}.` : 'A strange little catalog find.';
  return truncateText(theme, 150);
}

function normalizeTags(tags, fallbackTags) {
  const normalized = Array.isArray(tags)
    ? tags
      .map((tag) => String(tag).toLowerCase().replace(/[^a-z0-9- ]/g, '').trim().replace(/\s+/g, '-'))
      .filter(Boolean)
    : [];

  return Array.from(new Set([...normalized, ...(fallbackTags || [])])).slice(0, 5);
}

function normalizeQualityScore(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0.05, Math.min(0.98, Number(parsed.toFixed(4))));
}

function buildProductEmbeddingText(product) {
  return [
    product.punnyTitle,
    product.title,
    product.wittyDescription,
    product.sourceQuery,
    product.humorTags?.join(' '),
  ].filter(Boolean).join('. ');
}

async function enrichCopyBatch(products) {
  const openai = getOpenAIClient();

  if (!openai) {
    throw new Error('OPENAI_API_KEY is required for catalog enrichment.');
  }

  const productSummaries = products.map((product) => ({
    id: product.id,
    title: product.title,
    sourceQuery: product.sourceQuery,
    price: product.price,
    currentTags: product.humorTags || [],
  }));

  const completion = await openai.chat.completions.create({
    model: process.env.CATALOG_ENRICH_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You write concise, funny ecommerce catalog copy for gag gifts. Return valid JSON only.',
      },
      {
        role: 'user',
        content: `Enrich these products for a funny gift catalog.

Rules:
- Keep punnyTitle under 78 characters.
- Keep wittyDescription under 150 characters.
- humorTags should be 2-5 lowercase kebab-case tags.
- qualityScore is 0.05 to 0.98 based on giftability, visual clarity, novelty, and broad appeal.
- isActive should be false only for irrelevant, unsafe, broken-looking, or non-giftable products.

Return exactly:
{
  "products": [
    {
      "id": "ASIN",
      "punnyTitle": "...",
      "wittyDescription": "...",
      "humorTags": ["dad-joke"],
      "qualityScore": 0.72,
      "isActive": true
    }
  ]
}

Products:
${JSON.stringify(productSummaries, null, 2)}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No enrichment response from OpenAI.');
  }

  const parsed = JSON.parse(content);
  return new Map((parsed.products || []).map((item) => [item.id, item]));
}

async function generateProductEmbeddings(products) {
  const openai = getOpenAIClient();

  if (!openai || products.length === 0) {
    return new Map();
  }

  const inputs = products.map(buildProductEmbeddingText);
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: inputs,
    encoding_format: 'float',
  });

  return new Map(response.data.map((item, index) => [
    products[index].id,
    item.embedding,
  ]));
}

async function enrichProducts(products, options) {
  if (products.length === 0) {
    return [];
  }

  if (options.skipEnrichment) {
    return products.map((product) => ({
      ...product,
      punnyTitle: product.punnyTitle || fallbackPunnyTitle(product),
      wittyDescription: product.wittyDescription || fallbackWittyDescription(product),
      embedding: product.embedding || null,
    }));
  }

  const enriched = [];
  const batches = chunkArray(products, Math.max(1, options.enrichmentBatchSize));

  for (const [batchIndex, batch] of batches.entries()) {
    let copyById = new Map();

    try {
      copyById = await enrichCopyBatch(batch);
    } catch (error) {
      console.warn(`OpenAI copy enrichment failed for ${batch.length} products; using fallback copy: ${error.message}`);
    }

    const copyEnriched = batch.map((product) => {
      const copy = copyById.get(product.id) || {};
      const humorTags = normalizeTags(copy.humorTags, product.humorTags);

      return {
        ...product,
        punnyTitle: truncateText(copy.punnyTitle || product.punnyTitle || fallbackPunnyTitle(product), 78),
        wittyDescription: truncateText(copy.wittyDescription || product.wittyDescription || fallbackWittyDescription(product), 150),
        humorTags,
        qualityScore: normalizeQualityScore(copy.qualityScore, product.qualityScore || scoreCandidate(product)),
        isActive: product.isActive && copy.isActive !== false,
      };
    });

    let embeddingsById = new Map();

    try {
      embeddingsById = await generateProductEmbeddings(copyEnriched);
    } catch (error) {
      console.warn(`OpenAI embedding enrichment failed for ${batch.length} products: ${error.message}`);
    }

    copyEnriched.forEach((product) => {
      enriched.push({
        ...product,
        embedding: embeddingsById.get(product.id) || product.embedding || null,
      });
    });

    console.log(`Enriched catalog batch ${batchIndex + 1}/${batches.length} (${enriched.length}/${products.length} products)`);
  }

  return enriched;
}

function isActiveCatalogCandidate(product, options) {
  if (!product.imageUrl || !product.affiliateUrl) {
    return false;
  }

  return product.price <= 0 || (product.price >= options.minPrice && product.price <= options.maxPrice);
}

function isAmazonThrottleError(error) {
  return (
    error instanceof Error &&
    /Amazon (SearchItems|GetItems) failed \(429\)|TooManyRequests/i.test(error.message)
  );
}

function isAmazonPaapiDeprecatedError(error) {
  return (
    error instanceof Error &&
    /Amazon (SearchItems|GetItems) failed \(403\).*Product Advertising API is deprecated/i.test(error.message)
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toPostgresTextArray(values) {
  return `{${values
    .map((value) => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
    .join(',')}}`;
}

function toPostgresVector(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return `[${value.join(',')}]`;
}

async function searchAmazonCandidates(theme, options) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    throw new Error('Google Search env vars are required for catalog prefetch.');
  }

  const params = new URLSearchParams({
    key: apiKey,
    cx: searchEngineId,
    q: `${theme} amazon product`,
    siteSearch: 'amazon.com',
    siteSearchFilter: 'i',
    num: String(Math.min(options.perTheme, 10)),
  });

  const response = await fetch(`https://customsearch.googleapis.com/customsearch/v1?${params}`);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google CSE failed for "${theme}" (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const items = data.items ?? [];
  const discovered = items
    .map((item) => {
      const asin = extractAsin(item.link || '');
      if (!asin) return null;

      const metatag = item.pagemap?.metatags?.[0] ?? {};
      const rawImageUrl = metatag['og:image'] || item.pagemap?.cse_image?.[0]?.src || '';
      const snippetPrice = String(item.snippet || '').match(/\$(\d+(?:\.\d{2})?)/);

      return {
        asin,
        fallbackTitle: cleanTitle(item.title || ''),
        fallbackImageUrl: cleanAmazonImageUrl(rawImageUrl),
        fallbackPrice: Number.parseFloat(metatag['og:price:amount'] || snippetPrice?.[1] || '0'),
      };
    })
    .filter(Boolean);

  if (discovered.length === 0) {
    try {
      return await searchAmazonSearchItems(theme, options);
    } catch (error) {
      if (!isAmazonPaapiDeprecatedError(error)) throw error;
      console.warn(`Amazon PA-API SearchItems is deprecated and Google CSE found no candidates for "${theme}"`);
      return [];
    }
  }

  let enriched;
  try {
    enriched = await getAmazonItems(discovered.map((item) => item.asin));
  } catch (error) {
    if (!isAmazonPaapiDeprecatedError(error)) throw error;

    console.warn(
      `Amazon PA-API is deprecated; using ${discovered.length} Google CSE discoveries without PA-API enrichment`
    );
    enriched = discovered.map((item) => ({
      id: item.asin,
      title: item.fallbackTitle,
      price: item.fallbackPrice,
      currency: 'USD',
      imageUrl: item.fallbackImageUrl,
      affiliateUrl: amazonAffiliateUrl(item.asin, process.env.AMAZON_ASSOCIATE_TAG || ''),
      source: 'amazon',
      remotelyVerified: false,
    }));
  }
  const fallbackTitles = new Map(discovered.map((item) => [item.asin, item.fallbackTitle]));
  const candidates = finalizeProducts(
    enriched.map((product) => ({
      ...product,
      title: product.title || fallbackTitles.get(product.id) || '',
    })),
    theme,
    options
  );

  if (candidates.length >= Math.min(options.perTheme, 10)) {
    return candidates;
  }

  let fallbackCandidates = [];

  try {
    fallbackCandidates = await searchAmazonSearchItems(theme, options);
  } catch (error) {
    if (isAmazonThrottleError(error)) {
      console.warn(`Amazon SearchItems throttled for "${theme}"; using partial candidate set`);
    } else if (isAmazonPaapiDeprecatedError(error)) {
      console.warn(`Amazon PA-API SearchItems is deprecated; using partial Google CSE candidate set for "${theme}"`);
    } else {
      throw error;
    }
  }

  const merged = new Map();

  [...candidates, ...fallbackCandidates].forEach((product) => {
    if (!merged.has(product.id)) {
      merged.set(product.id, product);
    }
  });

  return Array.from(merged.values());
}

function finalizeProducts(products, theme, options) {
  return products
    .map((product) => {
      const title = product.title || '';
      const price = Number.isFinite(product.price) ? product.price : 0;
      const humorTags = inferHumorTags(title, theme);
      const isActive = isActiveCatalogCandidate({ ...product, price }, options);

      if (!product.id || !title || !product.imageUrl) {
        return null;
      }

      return {
        ...product,
        title,
        price,
        sourceQuery: theme,
        humorTags,
        isActive,
        qualityScore: 0,
      };
    })
    .filter(Boolean)
    .map((product) => ({
      ...product,
      qualityScore: scoreCandidate(product),
    }));
}

function credentialScope(timestamp, region) {
  const date = timestamp.split('T')[0];
  return `${date}/${region}/ProductAdvertisingAPI/aws4_request`;
}

function createGetItemsCanonicalRequest(params, timestamp) {
  const payload = JSON.stringify(params);
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

  return [
    'POST',
    '/paapi5/getitems',
    '',
    'content-encoding:amz-1.0',
    'content-type:application/json; charset=utf-8',
    'host:webservices.amazon.com',
    `x-amz-date:${timestamp}`,
    `x-amz-target:${PAAPI_GET_ITEMS_TARGET}`,
    '',
    'content-encoding;content-type;host;x-amz-date;x-amz-target',
    hashedPayload,
  ].join('\n');
}

function createSearchItemsCanonicalRequest(params, timestamp) {
  const payload = JSON.stringify(params);
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

  return [
    'POST',
    '/paapi5/searchitems',
    '',
    'content-encoding:amz-1.0',
    'content-type:application/json; charset=utf-8',
    'host:webservices.amazon.com',
    `x-amz-date:${timestamp}`,
    `x-amz-target:${PAAPI_SEARCH_TARGET}`,
    '',
    'content-encoding;content-type;host;x-amz-date;x-amz-target',
    hashedPayload,
  ].join('\n');
}

function createAmazonSignature(canonicalRequest, timestamp, region) {
  const secretKey = amazonSecretKey();
  if (!secretKey) {
    throw new Error('Amazon PA-API secret key is not configured.');
  }

  const date = timestamp.split('T')[0];
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope(timestamp, region),
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = crypto.createHmac('sha256', `AWS4${secretKey}`).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update('ProductAdvertisingAPI').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

  return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
}

async function getAmazonItems(asins) {
  const uniqueAsins = Array.from(new Set(asins)).slice(0, 10);
  const region = process.env.AWS_REGION || 'us-east-1';
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const params = {
    PartnerTag: process.env.AMAZON_ASSOCIATE_TAG,
    PartnerType: 'Associates',
    ItemIds: uniqueAsins,
    Resources: [
      'Images.Primary.Large',
      'Images.Primary.Medium',
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'CustomerReviews.StarRating',
      'CustomerReviews.Count',
    ],
  };
  const canonicalRequest = createGetItemsCanonicalRequest(params, timestamp);
  const signature = createAmazonSignature(canonicalRequest, timestamp, region);

  let data;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch('https://webservices.amazon.com/paapi5/getitems', {
      method: 'POST',
      headers: {
        'Content-Encoding': 'amz-1.0',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Amz-Date': timestamp,
        'X-Amz-Target': PAAPI_GET_ITEMS_TARGET,
        Authorization: `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${credentialScope(timestamp, region)}, SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=${signature}`,
        Host: 'webservices.amazon.com',
      },
      body: JSON.stringify(params),
    });

    if (response.ok) {
      data = await response.json();
      break;
    }

    const body = await response.text();
    if (response.status === 429 && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      continue;
    }

    throw new Error(`Amazon GetItems failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const affiliateTag = process.env.AMAZON_ASSOCIATE_TAG || '';

  return (data.ItemsResult?.Items ?? []).map((item) => {
    const listing = item.Offers?.Listings?.[0];
    const rawImageUrl = item.Images?.Primary?.Large?.URL || item.Images?.Primary?.Medium?.URL || '';

    return {
      id: item.ASIN,
      title: item.ItemInfo?.Title?.DisplayValue || '',
      price: Number.parseFloat(String(listing?.Price?.Amount || '0')),
      currency: listing?.Price?.Currency || 'USD',
      imageUrl: cleanAmazonImageUrl(rawImageUrl),
      affiliateUrl: amazonAffiliateUrl(item.ASIN, affiliateTag),
      source: 'amazon',
      remotelyVerified: true,
      rating: item.CustomerReviews?.StarRating?.Value
        ? Number(item.CustomerReviews.StarRating.Value)
        : undefined,
      reviewCount: item.CustomerReviews?.Count
        ? Number(item.CustomerReviews.Count)
        : undefined,
    };
  });
}

async function searchAmazonSearchItems(theme, options) {
  const region = process.env.AWS_REGION || 'us-east-1';
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const params = {
    PartnerTag: process.env.AMAZON_ASSOCIATE_TAG,
    PartnerType: 'Associates',
    Keywords: theme,
    SearchIndex: 'All',
    ItemCount: Math.min(options.perTheme, 10),
    Resources: [
      'Images.Primary.Large',
      'Images.Primary.Medium',
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'CustomerReviews.StarRating',
      'CustomerReviews.Count',
    ],
  };
  const canonicalRequest = createSearchItemsCanonicalRequest(params, timestamp);
  const signature = createAmazonSignature(canonicalRequest, timestamp, region);

  let data;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch('https://webservices.amazon.com/paapi5/searchitems', {
      method: 'POST',
      headers: {
        'Content-Encoding': 'amz-1.0',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Amz-Date': timestamp,
        'X-Amz-Target': PAAPI_SEARCH_TARGET,
        Authorization: `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${credentialScope(timestamp, region)}, SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=${signature}`,
        Host: 'webservices.amazon.com',
      },
      body: JSON.stringify(params),
    });

    if (response.ok) {
      data = await response.json();
      break;
    }

    const body = await response.text();
    if (response.status === 429 && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      continue;
    }

    throw new Error(`Amazon SearchItems failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const products = (data.SearchResult?.Items ?? []).map((item) => {
    const listing = item.Offers?.Listings?.[0];
    const rawImageUrl = item.Images?.Primary?.Large?.URL || item.Images?.Primary?.Medium?.URL || '';

    return {
      id: item.ASIN,
      title: item.ItemInfo?.Title?.DisplayValue || '',
      price: Number.parseFloat(String(listing?.Price?.Amount || '0')),
      currency: listing?.Price?.Currency || 'USD',
      imageUrl: cleanAmazonImageUrl(rawImageUrl),
      affiliateUrl: amazonAffiliateUrl(item.ASIN),
      source: 'amazon',
      rating: item.CustomerReviews?.StarRating?.Value
        ? Number(item.CustomerReviews.StarRating.Value)
        : undefined,
      reviewCount: item.CustomerReviews?.Count
        ? Number(item.CustomerReviews.Count)
        : undefined,
    };
  });

  return finalizeProducts(products, theme, options);
}

async function upsertProduct(product) {
  const result = await sql.query(
    `
      INSERT INTO products (
        id,
        title,
        price,
        currency,
        image_url,
        affiliate_url,
        source,
        source_query,
        humor_tags,
        punny_title,
        witty_description,
        quality_score,
        rating,
        review_count,
        is_active,
        embedding,
        last_verified_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14, $15, $16::vector, CASE WHEN $17 THEN NOW() ELSE NULL END, NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        image_url = EXCLUDED.image_url,
        affiliate_url = EXCLUDED.affiliate_url,
        source = EXCLUDED.source,
        source_query = EXCLUDED.source_query,
        humor_tags = EXCLUDED.humor_tags,
        punny_title = COALESCE(EXCLUDED.punny_title, products.punny_title),
        witty_description = COALESCE(EXCLUDED.witty_description, products.witty_description),
        quality_score = EXCLUDED.quality_score,
        rating = EXCLUDED.rating,
        review_count = EXCLUDED.review_count,
        is_active = EXCLUDED.is_active,
        embedding = COALESCE(EXCLUDED.embedding, products.embedding),
        last_verified_at = CASE WHEN $17 THEN NOW() ELSE products.last_verified_at END,
        updated_at = NOW()
      RETURNING (xmax = 0) AS inserted
    `,
    [
      product.id,
      product.title,
      product.price,
      product.currency,
      product.imageUrl,
      product.affiliateUrl,
      product.source || 'amazon',
      product.sourceQuery,
      toPostgresTextArray(product.humorTags),
      product.punnyTitle || null,
      product.wittyDescription || null,
      product.qualityScore,
      product.rating || null,
      product.reviewCount || null,
      product.isActive,
      toPostgresVector(product.embedding),
      product.remotelyVerified !== false,
    ]
  );

  return Boolean(result.rows[0]?.inserted);
}

async function updateEnrichedProduct(product) {
  const result = await sql.query(
    `
      UPDATE products
      SET humor_tags = $2::text[],
          punny_title = $3,
          witty_description = $4,
          quality_score = $5,
          is_active = $6,
          embedding = COALESCE($7::vector, embedding),
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      product.id,
      toPostgresTextArray(product.humorTags),
      product.punnyTitle || null,
      product.wittyDescription || null,
      product.qualityScore,
      product.isActive,
      toPostgresVector(product.embedding),
    ]
  );

  return result.rowCount || 0;
}

async function getActiveCatalogIdentities() {
  const result = await sql.query(
    `SELECT id, title FROM products WHERE is_active = true AND title <> ''`
  );
  return result.rows;
}

async function auditAndRepairAmazonAffiliateUrls({ dryRun }) {
  const tag = process.env.AMAZON_ASSOCIATE_TAG;
  const expectedExpression = `'https://www.amazon.com/dp/' || id || '?tag=' || $1`;
  const where = `source = 'amazon' AND id ~ '^[A-Z0-9]{10}$' AND affiliate_url IS DISTINCT FROM ${expectedExpression}`;
  const audit = await sql.query(`SELECT COUNT(*)::int AS count FROM products WHERE ${where}`, [tag]);
  const mismatched = Number(audit.rows[0]?.count || 0);

  if (dryRun || mismatched === 0) return { mismatched, repaired: 0 };

  const repaired = await sql.query(
    `UPDATE products SET affiliate_url = ${expectedExpression}, updated_at = NOW() WHERE ${where}`,
    [tag]
  );
  return { mismatched, repaired: repaired.rowCount || 0 };
}

async function getProductsForRevalidation(limit, staleDays) {
  const result = await sql.query(
    `
      SELECT id, title, price, currency, image_url, affiliate_url, source, source_query,
             humor_tags, punny_title, witty_description, quality_score, rating, review_count,
             is_active, last_verified_at
      FROM products
      WHERE source = 'amazon'
        AND is_active = true
        AND id ~ '^[A-Z0-9]{10}$'
        AND (last_verified_at IS NULL OR last_verified_at <= NOW() - ($2 * INTERVAL '1 day'))
      ORDER BY last_verified_at ASC NULLS FIRST, updated_at ASC
      LIMIT $1
    `,
    [limit, staleDays]
  );
  return result.rows;
}

function revalidatedProduct(existing, remote, options) {
  const remotePrice = Number(remote.price || 0);
  const existingPrice = Number(existing.price || 0);
  const price = remotePrice > 0 ? remotePrice : existingPrice;
  const product = {
    id: existing.id,
    title: remote.title || existing.title,
    price,
    currency: remotePrice > 0
      ? (remote.currency || existing.currency || 'USD')
      : (existing.currency || remote.currency || 'USD'),
    imageUrl: remote.imageUrl || existing.image_url,
    affiliateUrl: amazonAffiliateUrl(existing.id),
    source: 'amazon',
    sourceQuery: existing.source_query || '',
    humorTags: existing.humor_tags || inferHumorTags(remote.title || existing.title, existing.source_query || ''),
    punnyTitle: existing.punny_title,
    wittyDescription: existing.witty_description,
    qualityScore: Number(existing.quality_score || 0.35),
    rating: remote.rating ?? existing.rating,
    reviewCount: remote.reviewCount ?? existing.review_count,
    // The upsert preserves the stored embedding when this value is absent.
    // Avoid sending a 1536-dimension vector out of Neon just to write it back.
    embedding: undefined,
  };
  return { ...product, isActive: isActiveCatalogCandidate(product, options) };
}

async function deactivateConfirmedMissing(ids, deactivateAfterDays, dryRun) {
  if (ids.length === 0 || dryRun) return 0;
  const result = await sql.query(
    `
      UPDATE products
      SET is_active = false, updated_at = NOW()
      WHERE id = ANY($1::text[])
        AND COALESCE(last_verified_at, created_at) <= NOW() - ($2 * INTERVAL '1 day')
    `,
    [ids, deactivateAfterDays]
  );
  return result.rowCount || 0;
}

async function revalidateCatalog(options) {
  const affiliateAudit = await auditAndRepairAmazonAffiliateUrls(options);
  const existing = await getProductsForRevalidation(options.revalidateLimit, options.staleDays);
  let refreshed = 0;
  let confirmedMissing = 0;
  let deactivated = 0;
  let throttled = false;
  let paapiDeprecated = false;

  for (const batch of chunkArray(existing, 10)) {
    let remoteProducts;
    try {
      remoteProducts = await getAmazonItems(batch.map((product) => product.id));
    } catch (error) {
      if (isAmazonThrottleError(error)) {
        throttled = true;
        console.warn('Stopping revalidation after Amazon throttling; remaining products were left unchanged.');
        break;
      }
      if (isAmazonPaapiDeprecatedError(error)) {
        paapiDeprecated = true;
        console.warn('Stopping revalidation because PA-API is deprecated; all products were left unchanged.');
        break;
      }
      throw error;
    }

    const remoteById = new Map(remoteProducts.map((product) => [product.id, product]));
    const missing = batch.filter((product) => !remoteById.has(product.id));
    let confirmedIds = [];

    if (missing.length > 0) {
      await sleep(2000);
      try {
        const confirmation = await getAmazonItems(missing.map((product) => product.id));
        const confirmedPresent = new Map(confirmation.map((product) => [product.id, product]));
        confirmedPresent.forEach((product, id) => remoteById.set(id, product));
        confirmedIds = missing.filter((product) => !confirmedPresent.has(product.id)).map((product) => product.id);
      } catch (error) {
        console.warn(`Could not confirm ${missing.length} missing Amazon items; leaving them active: ${error.message}`);
      }
    }

    for (const product of batch) {
      const remote = remoteById.get(product.id);
      if (!remote) continue;
      if (!options.dryRun) await upsertProduct(revalidatedProduct(product, remote, options));
      refreshed += 1;
    }

    confirmedMissing += confirmedIds.length;
    if (options.deactivateMissing) {
      deactivated += await deactivateConfirmedMissing(confirmedIds, options.deactivateAfterDays, options.dryRun);
    }
    await sleep(1200);
  }

  return { selected: existing.length, refreshed, confirmedMissing, deactivated, throttled, paapiDeprecated, affiliateAudit };
}

async function getProductsNeedingEnrichment(limit) {
  if (limit <= 0) {
    return [];
  }

  const result = await sql.query(
    `
      SELECT
        id,
        title,
        price,
        currency,
        image_url,
        affiliate_url,
        source,
        source_query,
        humor_tags,
        punny_title,
        witty_description,
        quality_score,
        rating,
        review_count,
        is_active
      FROM products
      WHERE is_active = true
        AND image_url IS NOT NULL
        AND affiliate_url IS NOT NULL
        AND title <> ''
        AND (
          embedding IS NULL
          OR punny_title IS NULL
          OR witty_description IS NULL
          OR humor_tags IS NULL
          OR quality_score IS NULL
        )
      ORDER BY quality_score DESC NULLS LAST, updated_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    price: Number.parseFloat(String(row.price || '0')),
    currency: row.currency || 'USD',
    imageUrl: row.image_url,
    affiliateUrl: row.affiliate_url,
    source: row.source || 'amazon',
    sourceQuery: row.source_query || '',
    humorTags: row.humor_tags || inferHumorTags(row.title || '', row.source_query || ''),
    punnyTitle: row.punny_title || null,
    wittyDescription: row.witty_description || null,
    qualityScore: row.quality_score ? Number.parseFloat(String(row.quality_score)) : scoreCandidate({
      title: row.title || '',
      price: Number.parseFloat(String(row.price || '0')),
      imageUrl: row.image_url,
      humorTags: row.humor_tags || [],
    }),
    rating: row.rating ? Number.parseFloat(String(row.rating)) : undefined,
    reviewCount: row.review_count || undefined,
    isActive: row.is_active,
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  assertConfigured(options);

  if (options.revalidate) {
    const result = await revalidateCatalog(options);
    console.log(JSON.stringify({ dryRun: options.dryRun, revalidate: true, ...result }, null, 2));
    return;
  }

  const envThemes = process.env.CATALOG_DISCOVERY_THEMES
    ?.split('|')
    .map((theme) => theme.trim())
    .filter(Boolean);
  const themePool = options.themes || envThemes || DEFAULT_THEMES;
  const themes = options.themes
    ? themePool.slice(0, options.themeLimit)
    : selectRotatingThemes(themePool, options.themeLimit);
  const seen = new Set();
  const candidates = [];
  let backfilled = 0;

  if (options.enrichOnly) {
    console.log(`Catalog enrichment: max ${options.backfillLimit} existing active products`);
  } else {
    console.log(`Catalog prefetch: ${themes.length} themes, max ${options.maxNew} net-new products`);
  }

  if (!options.dryRun) {
    if (options.backfillLimit > 0) {
      const backfillProducts = await getProductsNeedingEnrichment(options.backfillLimit);

      if (backfillProducts.length > 0) {
        console.log(`Enriching ${backfillProducts.length} existing active products missing catalog fields`);
        const enrichedBackfill = await enrichProducts(backfillProducts, options);

        for (const product of enrichedBackfill) {
          await updateEnrichedProduct(product);
          backfilled += 1;
        }
      }
    }
  }

  if (options.enrichOnly) {
    console.log(JSON.stringify({
      dryRun: options.dryRun,
      enrichOnly: true,
      backfilled,
    }, null, 2));
    return;
  }

  for (const theme of themes) {
    let found = [];
    try {
      found = await searchAmazonCandidates(theme, options);
      console.log(`${theme}: ${found.length} candidate discoveries`);
    } catch (error) {
      if (isAmazonThrottleError(error)) {
        console.warn(`Skipping "${theme}" after repeated Amazon throttling`);
        continue;
      }
      throw error;
    }

    for (const product of found) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      candidates.push(product);
    }
  }

  candidates.sort((a, b) => b.qualityScore - a.qualityScore);
  const deduplicated = deduplicateCandidates(candidates);
  candidates.splice(0, candidates.length, ...deduplicated.products);
  let catalogDuplicates = 0;
  if (!options.dryRun && candidates.length > 0) {
    const catalog = await getActiveCatalogIdentities();
    const catalogDeduplicated = deduplicateAgainstCatalog(candidates, catalog);
    candidates.splice(0, candidates.length, ...catalogDeduplicated.products);
    catalogDuplicates = catalogDeduplicated.duplicates;
  }
  if (deduplicated.duplicates + catalogDuplicates > 0) {
    console.log(`Filtered ${deduplicated.duplicates + catalogDuplicates} exact or near-duplicate discoveries`);
  }

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      themes,
      activeCandidates: candidates.filter((product) => product.isActive).length,
      candidates: candidates.slice(0, options.maxNew),
    }, null, 2));
    return;
  }

  let inserted = 0;
  let updated = 0;
  const enrichedCandidates = await enrichProducts(candidates, options);

  for (const product of enrichedCandidates) {
    const wasInserted = await upsertProduct(product);
    if (wasInserted) inserted += 1;
    else updated += 1;

    if (inserted >= options.maxNew) {
      break;
    }
  }

  console.log(JSON.stringify({
    dryRun: false,
    themes,
    backfilled,
    duplicatesFiltered: deduplicated.duplicates + catalogDuplicates,
    candidates: candidates.length,
    activeCandidates: enrichedCandidates.filter((product) => product.isActive).length,
    enrichedCandidates: enrichedCandidates.length,
    embeddedCandidates: enrichedCandidates.filter((product) => Array.isArray(product.embedding) && product.embedding.length > 0).length,
    inserted,
    updated,
  }, null, 2));
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  amazonAffiliateUrl,
  deduplicateAgainstCatalog,
  deduplicateCandidates,
  isAmazonPaapiDeprecatedError,
  normalizedTitleTokens,
  parseArgs,
  revalidatedProduct,
  selectRotatingThemes,
  titleSimilarity,
};
