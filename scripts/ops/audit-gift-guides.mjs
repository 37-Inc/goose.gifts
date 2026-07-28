#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  isCatalogDisplayEligibleProduct,
  suppressNearDuplicateProducts,
} from '../../lib/db/product-scoring.ts';

const DEFAULT_SITE_URL = 'https://www.goose.gifts';
const DEFAULT_MINIMUM_USEFUL_PRODUCTS = 12;

function decodeFlightString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

export function extractGuideProducts(html) {
  const products = new Map();

  for (const chunk of html.split('\\"id\\":\\"').slice(1)) {
    const id = chunk.match(/^(.*?)\\",/)?.[1];
    const title = chunk.match(/\\"title\\":\\"(.*?)\\",\\"punnyTitle/)?.[1];
    const qualityScore = chunk.match(/\\"qualityScore\\":([0-9.]+)/)?.[1];
    const isActive = chunk.match(/\\"isActive\\":(true|false)/)?.[1];
    const imageUrl = chunk.match(/\\"imageUrl\\":\\"(.*?)\\"/)?.[1];
    const affiliateUrl = chunk.match(/\\"affiliateUrl\\":\\"(.*?)\\"/)?.[1];

    if (!id || !title || !qualityScore || !imageUrl || !affiliateUrl) continue;

    products.set(id, {
      id: decodeFlightString(id),
      title: decodeFlightString(title),
      qualityScore: Number(qualityScore),
      isActive: isActive !== 'false',
      price: 0,
      currency: 'USD',
      imageUrl: decodeFlightString(imageUrl),
      affiliateUrl: decodeFlightString(affiliateUrl),
      source: 'amazon',
    });
  }

  return [...products.values()];
}

export function extractGuideUrls(sitemapXml, siteUrl = DEFAULT_SITE_URL) {
  const canonicalOrigin = new URL(siteUrl).origin;
  const urls = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((match) => match[1].replaceAll('&amp;', '&'))
    .filter((url) => {
      const parsed = new URL(url, canonicalOrigin);
      return parsed.origin === canonicalOrigin
        && parsed.pathname.startsWith('/gift-guides/')
        && parsed.pathname.split('/').filter(Boolean).length === 2;
    });

  return [...new Set(urls)].sort();
}

export function auditGuideProducts(products, minimumUsefulProducts = DEFAULT_MINIMUM_USEFUL_PRODUCTS) {
  const eligible = products.filter((product) => isCatalogDisplayEligibleProduct(product, {
    allowExcludedFormats: true,
    requireTitleBrandFit: false,
  }));
  const distinct = suppressNearDuplicateProducts(eligible);

  return {
    raw: products.length,
    eligible: eligible.length,
    distinct: distinct.length,
    rejected: products.length - eligible.length,
    duplicates: eligible.length - distinct.length,
    underfilled: distinct.length < minimumUsefulProducts,
  };
}

function parseArgs(argv) {
  const options = {
    siteUrl: DEFAULT_SITE_URL,
    minimumUsefulProducts: DEFAULT_MINIMUM_USEFUL_PRODUCTS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--site-url') {
      options.siteUrl = argv[index + 1] || options.siteUrl;
      index += 1;
    } else if (argv[index] === '--minimum') {
      options.minimumUsefulProducts = Math.max(1, Number.parseInt(argv[index + 1] || '', 10) || options.minimumUsefulProducts);
      index += 1;
    }
  }

  return options;
}

export async function auditPublicGiftGuides({
  siteUrl = DEFAULT_SITE_URL,
  minimumUsefulProducts = DEFAULT_MINIMUM_USEFUL_PRODUCTS,
  fetchImpl = fetch,
} = {}) {
  const sitemapResponse = await fetchImpl(`${siteUrl}/sitemap.xml`);
  if (!sitemapResponse.ok) {
    throw new Error(`Sitemap request failed with ${sitemapResponse.status}.`);
  }

  const targetOrigin = new URL(siteUrl).origin;
  const guideUrls = extractGuideUrls(await sitemapResponse.text(), DEFAULT_SITE_URL)
    .map((url) => new URL(new URL(url).pathname, targetOrigin).href);
  const guides = [];

  for (const url of guideUrls) {
    const response = await fetchImpl(url);
    if (!response.ok) {
      guides.push({
        slug: new URL(url).pathname.split('/').filter(Boolean).at(-1),
        url,
        error: `HTTP ${response.status}`,
      });
      continue;
    }

    const products = extractGuideProducts(await response.text());
    guides.push({
      slug: new URL(url).pathname.split('/').filter(Boolean).at(-1),
      url,
      ...auditGuideProducts(products, minimumUsefulProducts),
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    siteUrl,
    minimumUsefulProducts,
    guideCount: guides.length,
    underfilledCount: guides.filter((guide) => guide.underfilled).length,
    errorCount: guides.filter((guide) => guide.error).length,
    guides,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await auditPublicGiftGuides(options);
  console.log(JSON.stringify(report, null, 2));

  if (report.errorCount > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
