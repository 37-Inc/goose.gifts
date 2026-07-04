#!/usr/bin/env node
import dotenv from 'dotenv';
import { createPool } from '@vercel/postgres';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

const DEFAULT_DAYS = 31;

function parseArgs(argv) {
  const options = {
    days: DEFAULT_DAYS,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--days') {
      options.days = Number(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--days=')) {
      options.days = Number(arg.slice('--days='.length));
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.days) || options.days < 1) {
    throw new Error('--days must be a positive number');
  }

  return {
    ...options,
    days: Math.min(Math.floor(options.days), 31),
    requestedDays: Math.floor(options.days),
  };
}

function printHelp() {
  console.log(`Usage: npm run analytics:snapshot -- [--days 31] [--json]

Pulls a read-only traffic and interaction snapshot from:
- Vercel Web Analytics API for visitor/pageview data.
- Neon/Vercel Postgres for search, click, bundle, and catalog-quality data.

The Vercel Hobby plan exposes the latest 31 days of Web Analytics data, so
larger --days values are clamped to 31.`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(days) {
  const untilDate = new Date();
  untilDate.setUTCHours(0, 0, 0, 0);

  const sinceDate = new Date(untilDate);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - (days - 1));

  return {
    since: formatDate(sinceDate),
    until: formatDate(untilDate),
  };
}

async function vercelApi(path, params = {}) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error('VERCEL_TOKEN is required for Vercel Web Analytics');
  }

  const url = new URL(`https://api.vercel.com${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.error?.message ?? response.statusText;
    const code = body?.error?.code ?? response.status;
    throw new Error(`${path} failed (${code}): ${message}`);
  }

  return body;
}

async function findVercelProject() {
  const configuredProjectId = process.env.VERCEL_PROJECT_ID;
  const configuredTeamId = process.env.VERCEL_TEAM_ID;
  if (configuredProjectId) {
    return {
      id: configuredProjectId,
      name: process.env.VERCEL_PROJECT_NAME || 'configured-project',
      scope: configuredTeamId ? { teamId: configuredTeamId } : {},
    };
  }

  const scopes = [{ label: 'personal', scope: {} }];
  try {
    const teams = await vercelApi('/v2/teams');
    for (const team of teams.teams ?? []) {
      scopes.push({
        label: team.slug || team.name || team.id,
        scope: { teamId: team.id },
      });
    }
  } catch {
    // Project-scoped tokens may not be able to list teams; personal scope can
    // still find the project when the token is scoped directly to it.
  }

  for (const { label, scope } of scopes) {
    const projects = await vercelApi('/v9/projects', { ...scope, search: 'goose' });
    const match = (projects.projects ?? []).find((project) => (
      project.name === 'goose-gifts' || project.name.includes('goose')
    ));
    if (match) {
      return {
        id: match.id,
        name: match.name,
        accountId: match.accountId,
        scope,
        scopeLabel: label,
      };
    }
  }

  throw new Error('Could not find the goose.gifts Vercel project');
}

async function fetchVercelAnalytics({ days }) {
  const project = await findVercelProject();
  const range = dateRange(days);
  const baseParams = {
    projectId: project.id,
    ...project.scope,
    ...range,
  };

  const [totals, daily, paths, referrers, countries] = await Promise.all([
    vercelApi('/v1/query/web-analytics/visits/count', baseParams),
    vercelApi('/v1/query/web-analytics/visits/aggregate', {
      ...baseParams,
      by: 'day',
    }),
    vercelApi('/v1/query/web-analytics/visits/aggregate', {
      ...baseParams,
      by: 'requestPath',
      limit: 10,
    }),
    vercelApi('/v1/query/web-analytics/visits/aggregate', {
      ...baseParams,
      by: 'referrerHostname',
      limit: 10,
    }),
    vercelApi('/v1/query/web-analytics/visits/aggregate', {
      ...baseParams,
      by: 'country',
      limit: 10,
    }),
  ]);

  return {
    project: {
      id: project.id,
      name: project.name,
      scopeLabel: project.scopeLabel,
      accountId: project.accountId,
    },
    range,
    totals: totals.data,
    daily: daily.data,
    topPaths: paths.data,
    topReferrers: referrers.data,
    topCountries: countries.data,
  };
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
          (SELECT count(*)::int FROM gift_bundles WHERE deleted_at IS NULL) AS bundles,
          (SELECT coalesce(sum(view_count),0)::int FROM gift_bundles WHERE deleted_at IS NULL) AS bundle_views_lifetime,
          (SELECT coalesce(sum(click_count),0)::int FROM gift_bundles WHERE deleted_at IS NULL) AS bundle_clicks_lifetime,
          (SELECT count(*)::int FROM products) AS products,
          (SELECT count(*)::int FROM products WHERE is_active) AS active_products,
          (SELECT coalesce(sum(impression_count),0)::int FROM products) AS product_impressions_lifetime,
          (SELECT coalesce(sum(click_count),0)::int FROM products) AS product_clicks_lifetime,
          (SELECT count(*)::int FROM product_clicks) AS product_click_events_lifetime,
          (SELECT count(*)::int FROM search_queries) AS searches_lifetime,
          (SELECT max(created_at) FROM gift_bundles WHERE deleted_at IS NULL) AS latest_bundle_created_at,
          (SELECT max(created_at) FROM product_clicks) AS latest_product_click_at,
          (SELECT max(created_at) FROM search_queries) AS latest_search_at
      `),
      queryDb('windows', db, `
        SELECT window_label,
          (SELECT count(*)::int FROM product_clicks WHERE created_at >= now() - window_label::interval) AS product_click_events,
          (SELECT count(*)::int FROM search_queries WHERE created_at >= now() - window_label::interval) AS searches,
          (SELECT count(*)::int FROM gift_bundles WHERE created_at >= now() - window_label::interval AND deleted_at IS NULL) AS bundles_created,
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
      queryDb('topReferrers90d', db, `
        SELECT nullif(regexp_replace(coalesce(referer, ''), '^https?://([^/]+).*$', '\\1'), '') AS referrer_host,
          count(*)::int AS clicks
        FROM product_clicks
        WHERE created_at >= now() - interval '90 days'
        GROUP BY 1
        ORDER BY clicks DESC
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
      queryDb('catalogQuality', db, `
        SELECT
          count(*) FILTER (WHERE is_active)::int AS active,
          count(*) FILTER (WHERE NOT is_active)::int AS inactive,
          count(*) FILTER (WHERE is_active AND price::numeric = 0)::int AS active_unknown_price,
          count(*) FILTER (WHERE is_active AND image_url IS NULL)::int AS active_without_image,
          count(*) FILTER (WHERE is_active AND affiliate_url IS NULL)::int AS active_without_affiliate,
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

function latestNonzeroDay(daily) {
  return [...daily].reverse().find((row) => row.visitors || row.pageviews) ?? null;
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
  const { vercel, database, notes } = snapshot;
  const summary = database.summary[0];
  const catalog = database.catalogQuality[0];
  const latestDay = latestNonzeroDay(vercel.daily);

  console.log('goose.gifts analytics snapshot');
  console.log(`Range: ${vercel.range.since} through ${vercel.range.until} UTC`);
  console.log('');
  console.log('Vercel Web Analytics');
  console.log(`- Project: ${vercel.project.name} (${vercel.project.id})`);
  console.log(`- Visitors: ${vercel.totals.visitors.toLocaleString()}`);
  console.log(`- Pageviews: ${vercel.totals.pageviews.toLocaleString()}`);
  console.log(`- Last nonzero day: ${latestDay ? `${latestDay.timestamp} (${latestDay.visitors} visitors, ${latestDay.pageviews} pageviews)` : 'none'}`);
  console.log('- Top paths:');
  console.log(formatRows(
    vercel.topPaths,
    (row) => `  ${row.requestPath || '/'} - ${row.visitors} visitors, ${row.pageviews} pageviews`,
  ));
  console.log('- Top referrers:');
  console.log(formatRows(
    vercel.topReferrers,
    (row) => `  ${row.referrerHostname || '(direct/unknown)'} - ${row.visitors} visitors, ${row.pageviews} pageviews`,
  ));
  console.log('- Top countries:');
  console.log(formatRows(
    vercel.topCountries,
    (row) => `  ${row.country || '(unknown)'} - ${row.visitors} visitors, ${row.pageviews} pageviews`,
  ));
  console.log('');
  console.log('Database interaction analytics');
  console.log(`- Bundles: ${summary.bundles.toLocaleString()} (${summary.bundle_views_lifetime.toLocaleString()} lifetime bundle views, ${summary.bundle_clicks_lifetime.toLocaleString()} bundle clicks)`);
  console.log(`- Products: ${summary.products.toLocaleString()} (${summary.active_products.toLocaleString()} active)`);
  console.log(`- Product impressions/click events: ${summary.product_impressions_lifetime.toLocaleString()} impressions, ${summary.product_click_events_lifetime.toLocaleString()} click events`);
  console.log(`- Searches: ${summary.searches_lifetime.toLocaleString()} lifetime; latest search ${formatTimestamp(summary.latest_search_at)}`);
  console.log('- Recent windows:');
  console.log(formatRows(
    database.windows,
    (row) => `  ${row.window_label}: ${row.searches} searches, ${row.product_click_events} product clicks, ${row.bundles_created} bundles created, ${row.products_created} products created`,
  ));
  console.log('- Top clicked products in 90d:');
  console.log(formatRows(
    database.topClickedProducts90d,
    (row) => `  ${row.product_id} - ${row.clicks} clicks - ${row.title}`,
  ));
  console.log('');
  console.log('Catalog readiness');
  console.log(`- Active/inactive: ${catalog.active.toLocaleString()} / ${catalog.inactive.toLocaleString()}`);
  console.log(`- Active unknown-price products: ${catalog.active_unknown_price.toLocaleString()}`);
  console.log(`- Active missing image/affiliate: ${catalog.active_without_image.toLocaleString()} / ${catalog.active_without_affiliate.toLocaleString()}`);
  console.log(`- Embedded products: ${catalog.embedded_products.toLocaleString()}`);
  console.log(`- Products with punny copy: ${catalog.products_with_punny_copy.toLocaleString()}`);

  if (notes.length) {
    console.log('');
    console.log('Notes');
    for (const note of notes) {
      console.log(`- ${note}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const notes = [];
  if (options.requestedDays > options.days) {
    notes.push(`Requested ${options.requestedDays} days; clamped to ${options.days} because Vercel Hobby Web Analytics exposes 31 days.`);
  }

  const [vercel, database] = await Promise.all([
    fetchVercelAnalytics(options),
    fetchDatabaseAnalytics(),
  ]);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    vercel,
    database,
    notes,
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
