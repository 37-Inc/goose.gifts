import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const QA_PATTERN = 'qa|operator|goose-proof|ga-proof|no-geo-proof|cta_live_verify';
async function requestJson(url, options = {}, send = fetch) {
  const response = await send(url, { ...options, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(`analytics_http_${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('analytics_response_bound');
  return JSON.parse(text);
}
function unknown(error) { return { status: 'unknown', reason: /^analytics_http_\d+$/.test(error.message) ? error.message : 'credential_or_provider_read_unavailable' }; }

/** Explicit existing property/project only. Queries are aggregate, bounded and QA/operator-excluded. */
export async function readPinterestSiteSignals(now = new Date(), dependencies = {}) {
  const read = (url, options) => requestJson(url, options, dependencies.fetch ?? fetch);
  const start = new Date(now.getTime() - 7 * 86400000);
  const localDate = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  const [ga4, posthog] = await Promise.all([
    (async () => {
      try {
        const token = dependencies.ga4Token ? await dependencies.ga4Token() : execFileSync('gcloud', ['auth', 'application-default', 'print-access-token', '--scopes=https://www.googleapis.com/auth/analytics.readonly'], {
          encoding: 'utf8', timeout: 15000, maxBuffer: 8192, stdio: ['ignore', 'pipe', 'ignore'],
          env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: path.join(os.homedir(), '.config/gcloud/portfolio-search-console-sa.json') },
        }).trim();
        const filter = (name, matchType, value) => ({ filter: { fieldName: name, stringFilter: { matchType, value, caseSensitive: false } } });
        const reports = await Promise.all(['sessions', 'retailer'].map(async kind => {
          const body = { dateRanges: [{ startDate: localDate(start), endDate: localDate(now) }], limit: 100,
            dimensions: [{ name: 'hostName' }, { name: 'sessionSourceMedium' }, { name: 'sessionCampaignName' }],
            metrics: kind === 'sessions' ? [{ name: 'sessions' }, { name: 'engagedSessions' }] : [{ name: 'eventCount' }],
            dimensionFilter: { andGroup: { expressions: [
              filter('hostName', 'FULL_REGEXP', '(www\\.)?(goose|stupid)\\.gifts'),
              { notExpression: filter('sessionCampaignName', 'PARTIAL_REGEXP', QA_PATTERN) },
              { notExpression: filter('sessionMedium', 'EXACT', 'qa') },
              ...(kind === 'retailer' ? [filter('eventName', 'EXACT', 'conversion_event_outbound_click')] : []),
            ] } } };
          const result = await read('https://analyticsdata.googleapis.com/v1beta/properties/507421709:runReport', {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          if (result.rowCount >= 100 || result.metadata?.dataLossFromOtherRow === true) throw new Error('analytics_report_truncated');
          return { kind, request: body, result };
        }));
        return { status: 'measured', propertyId: '507421709', reports };
      } catch (error) { return { ...unknown(error), propertyId: '507421709' }; }
    })(),
    (async () => {
      try {
        const credentials = dependencies.posthogCredentials ? await dependencies.posthogCredentials()
          : JSON.parse(fs.readFileSync(path.join(os.homedir(), '.posthog/credentials.json'), 'utf8'));
        if (typeof credentials.token !== 'string' || !credentials.token) throw new Error();
        const headers = { Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json' };
        const base = 'https://us.posthog.com/api/projects/550427';
        const project = await read(`${base}/`, { headers });
        if (project.id !== 550427) throw new Error();
        const campaign = "lower(coalesce(toString(properties.traffic_campaign),toString(properties.utm_campaign),''))";
        const source = "lower(coalesce(toString(properties.traffic_source),toString(properties.utm_source),''))";
        const excluded = `(match(${campaign},'${QA_PATTERN}') OR lower(toString(properties.traffic_medium))='qa')`;
        const window = `timestamp >= toDateTime('${start.toISOString()}') AND timestamp <= toDateTime('${now.toISOString()}')`;
        // Exclude the entire temporary QA identity, including product events lacking campaign fields.
        const where = `${window} AND NOT ${excluded} AND distinct_id NOT IN (SELECT distinct_id FROM events WHERE ${window} AND ${excluded})`;
        const reports = await Promise.all([
          `SELECT event,count(),min(timestamp),max(timestamp) FROM events WHERE ${where} GROUP BY event ORDER BY count() DESC LIMIT 25`,
          `SELECT event,${source} source,${campaign} campaign,count() FROM events WHERE ${where} AND (${source} LIKE '%pinterest%' OR event='conversion_event_outbound_click') GROUP BY 1,2,3 ORDER BY count() DESC LIMIT 100`,
        ].map(async sql => {
          const result = await read(`${base}/query/`, { method: 'POST', headers, body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } }) });
          if (!Array.isArray(result.results) || result.hasMore === true || result.results.length >= 100) throw new Error();
          return { query: sql, columns: result.columns, results: result.results, hasMore: result.hasMore ?? null };
        }));
        return { status: 'measured', projectId: 550427, projectName: project.name, startUtc: start.toISOString(), endUtc: now.toISOString(), reports };
      } catch (error) { return { ...unknown(error), projectId: 550427 }; }
    })(),
  ]);
  return { observedAt: now.toISOString(), ga4, posthog, caveats: [
    'Missing/billing-gapped/unattributable data is unknown, not zero. Retired detailed DB clicks and Vercel analytics are not queried.',
    'GA4 hostName separates old/new domains; PostHog intentionally strips host, URL and per-Pin utm_content. Do not claim host-specific sessions or per-Pin attribution from those absent fields.',
    'GA4 uses Pacific calendar dates through current partial day; PostHog uses the explicit rolling UTC window. Do not pool them as equal windows or deduplicated people.',
    'Tagged QA/operator campaigns and QA temporary identities are excluded. Untagged operator traffic may remain. No provider collection settings changed.',
  ] };
}
