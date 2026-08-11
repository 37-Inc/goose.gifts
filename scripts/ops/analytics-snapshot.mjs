#!/usr/bin/env node
import dotenv from 'dotenv';
import { createPool } from '@vercel/postgres';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

function parseArgs(argv) {
  const options = { json: false };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: npm run analytics:snapshot -- [--json]

Pulls a read-only interaction and catalog-quality snapshot from Neon/Vercel
Postgres. Use npm run analytics:ga4 for traffic and landing-page reports.`);
}

async function queryDb(name, db, text) {
  const result = await db.query(text);
  return [name, result.rows];
}

async function fetchDatabaseAnalytics() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is required for database analytics');
  }

  const db = createPool({ connectionString: process.env.POSTGRES_URL });

  try {
    const entries = await Promise.all([
      queryDb('summary', db, `
        SELECT
          (SELECT count(*)::int FROM products) AS products,
          (SELECT count(*)::int FROM products WHERE is_active) AS active_products,
          (SELECT coalesce(sum(impression_count),0)::int FROM products) AS product_impressions_lifetime,
          (SELECT coalesce(sum(click_count),0)::int FROM products) AS product_clicks_lifetime,
          (SELECT count(*)::int FROM product_clicks) AS product_click_events_lifetime,
          (SELECT count(*)::int FROM search_queries) AS searches_lifetime,
          (SELECT max(created_at) FROM product_clicks) AS latest_product_click_at,
          (SELECT max(created_at) FROM search_queries) AS latest_search_at
      `),
      queryDb('windows', db, `
        SELECT window_label,
          (SELECT count(*)::int FROM product_clicks WHERE created_at >= now() - window_label::interval) AS product_click_events,
          (SELECT count(*)::int FROM search_queries WHERE created_at >= now() - window_label::interval) AS searches,
          (SELECT count(*)::int FROM products WHERE created_at >= now() - window_label::interval) AS products_created
        FROM (VALUES ('24 hours'), ('7 days'), ('30 days'), ('90 days')) AS w(window_label)
      `),
      queryDb('topClickedProducts90d', db, `
        SELECT pc.product_id, p.title, p.source, count(*)::int AS clicks, max(pc.created_at) AS last_click_at
        FROM product_clicks pc
        LEFT JOIN products p ON p.id = pc.product_id
        WHERE pc.created_at >= now() - interval '90 days'
        GROUP BY pc.product_id, p.title, p.source
        ORDER BY clicks DESC, last_click_at DESC
        LIMIT 10
      `),
      queryDb('clickSources90d', db, `
        SELECT source, count(*)::int AS clicks, max(created_at) AS last_click_at
        FROM product_clicks
        WHERE created_at >= now() - interval '90 days'
        GROUP BY source
        ORDER BY clicks DESC, last_click_at DESC
        LIMIT 10
      `),
      queryDb('guideClicks90d', db, `
        SELECT bundle_slug AS guide_slug, count(*)::int AS clicks, max(created_at) AS last_click_at
        FROM product_clicks
        WHERE created_at >= now() - interval '90 days'
          AND source = 'gift_guide'
          AND bundle_slug IS NOT NULL
        GROUP BY bundle_slug
        ORDER BY clicks DESC, last_click_at DESC
        LIMIT 10
      `),
      queryDb('topReferrers90d', db, `
        SELECT coalesce(
            nullif(referrer_host, ''),
            nullif(regexp_replace(coalesce(referer, ''), '^https?://([^/]+).*$', '\\1'), '')
          ) AS referrer_host,
          count(*)::int AS clicks
        FROM product_clicks
        WHERE created_at >= now() - interval '90 days'
        GROUP BY 1
        ORDER BY clicks DESC
        LIMIT 10
      `),
      queryDb('campaignClicks90d', db, `
        SELECT
          coalesce(nullif(utm_source, ''), '(none)') AS utm_source,
          coalesce(nullif(utm_medium, ''), '(none)') AS utm_medium,
          coalesce(nullif(utm_campaign, ''), '(none)') AS utm_campaign,
          count(*)::int AS clicks,
          max(created_at) AS last_click_at
        FROM product_clicks
        WHERE created_at >= now() - interval '90 days'
          AND (
            nullif(utm_source, '') IS NOT NULL
            OR nullif(utm_medium, '') IS NOT NULL
            OR nullif(utm_campaign, '') IS NOT NULL
          )
        GROUP BY 1, 2, 3
        ORDER BY clicks DESC, last_click_at DESC
        LIMIT 10
      `),
      queryDb('topSearches90d', db, `
        SELECT query, count(*)::int AS count, avg(result_count)::numeric(10,2) AS avg_results, max(created_at) AS last_search_at
        FROM search_queries
        WHERE created_at >= now() - interval '90 days'
        GROUP BY query
        ORDER BY count DESC, last_search_at DESC
        LIMIT 20
      `),
      queryDb('zeroResultSearches30d', db, `
        SELECT query, count(*)::int AS count, max(created_at) AS last_search_at
        FROM search_queries
        WHERE created_at >= now() - interval '30 days'
          AND result_count = 0
        GROUP BY query
        ORDER BY count DESC, last_search_at DESC
        LIMIT 20
      `),
      queryDb('catalogQuality', db, `
        SELECT
          count(*) FILTER (WHERE is_active)::int AS active,
          count(*) FILTER (WHERE NOT is_active)::int AS inactive,
          count(*) FILTER (WHERE is_active AND price::numeric = 0)::int AS active_unknown_price,
          count(*) FILTER (WHERE is_active AND image_url IS NULL)::int AS active_without_image,
          count(*) FILTER (WHERE is_active AND affiliate_url IS NULL)::int AS active_without_affiliate,
          count(*) FILTER (WHERE is_active AND nullif(btrim(source_query), '') IS NULL)::int AS active_without_source_query,
          count(*) FILTER (
            WHERE is_active
              AND quality_score::numeric >= 0.55
              AND (' ' || regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g') || ' ')
                ~ ' (funny|gag|prank|weird|novelty|ridiculous|sarcastic|silly|hilarious|joke|absurd|inappropriate|fart|poop|whoopee|bullshit|penis|testicle|middle finger|dad joke|white elephant|screaming goat|angry mama|animal butt|bacon candle|beer bong|cat butt|cereal killer|crab|duck decanter|emotional support|fake poop|fart machine|loch ness|nessie|pizza boss|rubber chicken|screaming chicken|squirrel hot tub|sword shaped|wacky waving|yodeling) '
              AND (
                (' ' || regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g') || ' ')
                  !~ ' (activity book|bath bomb|coloring|cookbook|cosmetic bag|eyeshadow|gift basket|journal|makeup|notebook|skincare|trivia book) '
                OR (' ' || regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g') || ' ')
                  ~ ' (book and figure|book with figure) '
              )
          )::int AS homepage_eligible,
          count(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded_products,
          count(*) FILTER (WHERE punny_title IS NOT NULL)::int AS products_with_punny_copy
        FROM products
      `),
    ]);

    return Object.fromEntries(entries);
  } finally {
    await db.end();
  }
}

function formatRows(rows, mapper) {
  if (!rows.length) {
    return '  none';
  }

  return rows.map(mapper).join('\n');
}

function formatTimestamp(value) {
  if (!value) {
    return 'never';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function printText(snapshot) {
  const { database } = snapshot;
  const summary = database.summary[0];
  const catalog = database.catalogQuality[0];

  console.log('goose.gifts analytics snapshot');
  console.log('Database interaction analytics');
  console.log(`- Products: ${summary.products.toLocaleString()} (${summary.active_products.toLocaleString()} active)`);
  console.log(`- Product impressions/click events: ${summary.product_impressions_lifetime.toLocaleString()} impressions, ${summary.product_click_events_lifetime.toLocaleString()} click events`);
  console.log(`- Product click counter: ${summary.product_clicks_lifetime.toLocaleString()} lifetime product clicks`);
  console.log(`- Searches: ${summary.searches_lifetime.toLocaleString()} lifetime; latest search ${formatTimestamp(summary.latest_search_at)}`);
  console.log('- Recent windows:');
  console.log(formatRows(
    database.windows,
    (row) => `  ${row.window_label}: ${row.searches} searches, ${row.product_click_events} product clicks, ${row.products_created} products created`,
  ));
  console.log('- Top clicked products in 90d:');
  console.log(formatRows(
    database.topClickedProducts90d,
    (row) => `  ${row.product_id} - ${row.clicks} clicks - ${row.title}`,
  ));
  console.log('- Click sources in 90d:');
  console.log(formatRows(
    database.clickSources90d,
    (row) => `  ${row.source} - ${row.clicks} clicks - latest ${formatTimestamp(row.last_click_at)}`,
  ));
  console.log('- Gift-guide clicks in 90d:');
  console.log(formatRows(
    database.guideClicks90d,
    (row) => `  ${row.guide_slug} - ${row.clicks} clicks - latest ${formatTimestamp(row.last_click_at)}`,
  ));
  console.log('- Top searches in 90d:');
  console.log(formatRows(
    database.topSearches90d,
    (row) => `  ${row.query} - ${row.count} searches - avg ${row.avg_results} results - latest ${formatTimestamp(row.last_search_at)}`,
  ));
  console.log('- Campaign-attributed clicks in 90d:');
  console.log(formatRows(
    database.campaignClicks90d,
    (row) => `  ${row.utm_source} / ${row.utm_medium} / ${row.utm_campaign} - ${row.clicks} clicks - latest ${formatTimestamp(row.last_click_at)}`,
  ));
  console.log('- Product-click referrers in 90d:');
  console.log(formatRows(
    database.topReferrers90d,
    (row) => `  ${row.referrer_host || '(direct/unknown)'} - ${row.clicks} clicks`,
  ));
  console.log('- Zero-result searches in 30d:');
  console.log(formatRows(
    database.zeroResultSearches30d,
    (row) => `  ${row.query} - ${row.count} searches - latest ${formatTimestamp(row.last_search_at)}`,
  ));
  console.log('');
  console.log('Catalog readiness');
  console.log(`- Active/inactive: ${catalog.active.toLocaleString()} / ${catalog.inactive.toLocaleString()}`);
  console.log(`- Active unknown-price products: ${catalog.active_unknown_price.toLocaleString()}`);
  console.log(`- Active missing image/affiliate: ${catalog.active_without_image.toLocaleString()} / ${catalog.active_without_affiliate.toLocaleString()}`);
  console.log(`- Active missing discovery source: ${catalog.active_without_source_query.toLocaleString()}`);
  console.log(`- Homepage relevance-gate eligible: ${catalog.homepage_eligible.toLocaleString()}`);
  console.log(`- Embedded products: ${catalog.embedded_products.toLocaleString()}`);
  console.log(`- Products with punny copy: ${catalog.products_with_punny_copy.toLocaleString()}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const database = await fetchDatabaseAnalytics();

  const snapshot = {
    generatedAt: new Date().toISOString(),
    database,
  };

  if (options.json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    printText(snapshot);
  }
}

main().catch((error) => {
  console.error(`analytics snapshot failed: ${error.message}`);
  process.exit(1);
});
