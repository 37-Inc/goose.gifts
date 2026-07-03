#!/usr/bin/env node

import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { sql } from '@vercel/postgres';

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
    else if (arg === '--themes') {
      options.themes = argv[++index]
        .split('|')
        .map((theme) => theme.trim())
        .filter(Boolean);
    }
  }

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
  --min-price 5             Minimum price for active homepage eligibility.
  --max-price 150           Maximum price for active homepage eligibility.
`);
}

function requiredEnv() {
  return {
    GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY,
    GOOGLE_SEARCH_ENGINE_ID: process.env.GOOGLE_SEARCH_ENGINE_ID,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_KEY_OR_AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    AMAZON_ASSOCIATE_TAG: process.env.AMAZON_ASSOCIATE_TAG,
    POSTGRES_URL: process.env.POSTGRES_URL,
  };
}

function assertConfigured(options) {
  const env = requiredEnv();
  const required = options.dryRun
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

function amazonSecretKey() {
  return process.env.AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
}

function cleanAmazonImageUrl(url) {
  if (!url) return '';

  try {
    const cleaned = url.replace(/\.(jpg|jpeg|png)_[A-Z]+[0-9,_]+\.(jpg|jpeg|png)$/i, '.$1');

    if (cleaned.includes('.jpg_') || cleaned.includes('.png_')) {
      const match = url.match(/\/images\/I\/([^._]+)\./);
      if (match) {
        const imageId = match[1];
        const domain = new URL(url).hostname;
        const ext = url.match(/\.(jpg|jpeg|png)/i)?.[1] || 'jpg';
        return `https://${domain}/images/I/${imageId}.${ext}`;
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

  if (product.imageUrl) score += 0.15;
  if (product.price >= 8 && product.price <= 60) score += 0.15;
  else if (product.price > 60 && product.price <= 150) score += 0.05;
  else if (product.price <= 0) score -= 0.1;
  if (/\b(funny|gag|prank|weird|novelty|ridiculous|sarcastic|silly)\b/.test(title)) score += 0.2;
  if (product.humorTags.length >= 2) score += 0.1;

  return Math.max(0.05, Math.min(0.95, Number(score.toFixed(4))));
}

function isAmazonThrottleError(error) {
  return (
    error instanceof Error &&
    /Amazon (SearchItems|GetItems) failed \(429\)|TooManyRequests/i.test(error.message)
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

      return {
        asin,
        fallbackTitle: cleanTitle(item.title || ''),
      };
    })
    .filter(Boolean);

  if (discovered.length === 0) {
    return searchAmazonSearchItems(theme, options);
  }

  const enriched = await getAmazonItems(discovered.map((item) => item.asin));
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
      const isActive = price >= options.minPrice && price <= options.maxPrice;

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
      affiliateUrl: `https://www.amazon.com/dp/${item.ASIN}?tag=${affiliateTag}`,
      source: 'amazon',
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
      affiliateUrl: item.DetailPageURL || `https://www.amazon.com/dp/${item.ASIN}?tag=${process.env.AMAZON_ASSOCIATE_TAG || ''}`,
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
        quality_score,
        rating,
        review_count,
        is_active,
        last_verified_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'amazon', $7, $8::text[], $9, $10, $11, $12, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        image_url = EXCLUDED.image_url,
        affiliate_url = EXCLUDED.affiliate_url,
        source_query = EXCLUDED.source_query,
        humor_tags = EXCLUDED.humor_tags,
        quality_score = EXCLUDED.quality_score,
        rating = EXCLUDED.rating,
        review_count = EXCLUDED.review_count,
        is_active = EXCLUDED.is_active,
        last_verified_at = NOW(),
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
      product.sourceQuery,
      toPostgresTextArray(product.humorTags),
      product.qualityScore,
      product.rating || null,
      product.reviewCount || null,
      product.isActive,
    ]
  );

  return Boolean(result.rows[0]?.inserted);
}

async function deactivateZeroPriceProducts() {
  const result = await sql.query(
    `
      UPDATE products
      SET is_active = false,
          updated_at = NOW(),
          last_verified_at = COALESCE(last_verified_at, NOW())
      WHERE is_active = true
        AND price <= 0
    `
  );

  return result.rowCount || 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  assertConfigured(options);

  const envThemes = process.env.CATALOG_DISCOVERY_THEMES
    ?.split('|')
    .map((theme) => theme.trim())
    .filter(Boolean);
  const themes = (options.themes || envThemes || DEFAULT_THEMES).slice(0, options.themeLimit);
  const seen = new Set();
  const candidates = [];
  let deactivatedZeroPrice = 0;

  console.log(`Catalog prefetch: ${themes.length} themes, max ${options.maxNew} net-new products`);

  if (!options.dryRun) {
    deactivatedZeroPrice = await deactivateZeroPriceProducts();
    console.log(`Deactivated ${deactivatedZeroPrice} legacy zero-price products before discovery`);
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

  for (const product of candidates) {
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
    deactivatedZeroPrice,
    candidates: candidates.length,
    activeCandidates: candidates.filter((product) => product.isActive).length,
    inserted,
    updated,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
