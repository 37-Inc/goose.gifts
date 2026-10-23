/** Read-only Pinterest source adapter. No maintenance, merchant/model calls or legacy DB fallback. */
import { resolveWranglerOAuth } from '../catalog/check-cloudflare-runner.ts';

const ACCOUNT = '7f05a1dcb6e16f9c239564a0293bbe74';
const DATABASE = '77b30f85-c57c-4acb-a0df-53368806c2a6';
const ORIGIN = 'https://stupid.gifts';
const MAX_BYTES = 2 * 1024 * 1024;
type Row = Record<string, string | number | boolean | null>;

async function boundedJson(response: Response) {
  if (!response.ok || !response.body) throw new Error('pinterest_catalog_read_unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('pinterest_catalog_response_bound'); }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

export function verifyPinterestIdentity(identity: Row) {
  if (!identity || !/^[a-zA-Z0-9._-]{1,200}$/.test(String(identity.release_id))
    || !/^[a-zA-Z0-9._-]{1,200}$/.test(String(identity.catalog_revision))
    || !/^[a-f0-9]{40}$/.test(String(identity.code_sha))
    || !/^[a-f0-9]{64}$/.test(String(identity.catalog_snapshot_sha256))
    || !/^[a-f0-9]{64}$/.test(String(identity.manifest_sha256)))
    throw new Error('pinterest_catalog_publication_mismatch');
}
export function verifyPinterestPublication(identity: Row, receipts: Row[]) {
  verifyPinterestIdentity(identity);
  if (receipts.length !== 1) throw new Error('pinterest_catalog_publication_mismatch');
  const receipt = receipts[0];
  const manifest = JSON.parse(String(receipt.manifest_json));
  for (const [liveKey, storedKey] of Object.entries({ release_id: 'releaseId', catalog_revision: 'catalogRevision',
    code_sha: 'codeSha', catalog_snapshot_sha256: 'catalogSnapshotSha256', manifest_sha256: 'manifestSha256' })) {
    if (identity[liveKey] !== manifest[storedKey]) throw new Error('pinterest_catalog_publication_mismatch');
  }
  if (receipt.release_id !== identity.release_id || receipt.catalog_revision !== identity.catalog_revision
    || receipt.code_sha !== identity.code_sha || !Number.isFinite(Date.parse(String(receipt.completed_at))))
    throw new Error('pinterest_catalog_publication_mismatch');
  return receipt;
}

function json(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
// Imported SQL timestamps are UTC, not the operator machine's local timezone.
export function catalogUtc(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  const text = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z` : value;
  const time = Date.parse(text); return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
export function normalizePinterestCatalogRow(row: Row) {
  const tags = json(row.humor_tags, null);
  return { ...row, is_active: row.is_active === 1, source_facts: json(row.source_facts, {}),
    humor_tags: Array.isArray(tags) ? tags : String(row.humor_tags || '').replace(/[{}]/g, '').split(',').filter(Boolean),
    availability_checked_at: catalogUtc(row.availability_checked_at), last_verified_at: catalogUtc(row.last_verified_at),
    editorial_generated_at: catalogUtc(row.editorial_generated_at) };
}

/** Four bounded SELECTs, one metadata GET, two live identity GETs. Only explicit Wrangler OAuth. */
export async function readPinterestCatalog(options: { fetch?: typeof fetch; token?: () => Promise<string> } = {}) {
  const send = options.fetch ?? fetch;
  const live = () => send(`${ORIGIN}/.well-known/catalog-release.json`, { redirect: 'error', signal: AbortSignal.timeout(10000) }).then(boundedJson);
  const identity = await live();
  // Validate before using the identity as query parameters.
  verifyPinterestIdentity(identity);
  const token = await (options.token ?? resolveWranglerOAuth)();
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}`;
  const request = async (suffix: string, batch?: {sql: string; params: string[]}[]) => {
    const envelope = await send(`${base}${suffix}`, { method: batch ? 'POST' : 'GET', redirect: 'error',
      signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}`, ...(batch ? { 'Content-Type': 'application/json' } : {}) },
      ...(batch ? { body: JSON.stringify({ batch }) } : {}) }).then(boundedJson);
    if (envelope.success !== true) throw new Error('pinterest_catalog_read_unavailable');
    return envelope.result;
  };
  const metadata = await request('');
  if (metadata.uuid !== DATABASE || metadata.name !== 'stupid-gifts-production') throw new Error('pinterest_catalog_database_mismatch');
  const latestCompleted = `SELECT id,mode,status,started_at,completed_at FROM catalog_runs
    WHERE status='completed' AND dry_run=0 AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1`;
  const columns = ['image_url', 'affiliate_url', 'price', 'source_query', 'humor_tags', 'rating', 'review_count',
    'source_facts', 'editorial_quality_score', 'editorial_generated_at'].map(key => `json_extract(p.source_record_json,'$.${key}') AS ${key}`).join(',');
  const statements = [
    { sql: 'SELECT release_id,catalog_revision,code_sha,completed_at,manifest_json FROM publication_receipts WHERE release_id=? LIMIT 2', params: [identity.release_id] },
    { sql: latestCompleted, params: [] },
    { sql: `SELECT p.id,p.public_id,c.slug,c.title,p.source,p.currency,p.quality_score,p.is_active,p.duplicate_of_product_id,
      p.editorial_status,p.source_facts_hash,p.editorial_source_hash,p.availability_status,
      COALESCE(p.availability_checked_at,json_extract(p.source_record_json,'$.availability_checked_at')) availability_checked_at,
      COALESCE(p.last_verified_at,json_extract(p.source_record_json,'$.last_verified_at')) last_verified_at,${columns}
      FROM catalog_public_products c JOIN products p ON p.id=c.product_id AND p.public_id=c.public_id
      WHERE c.catalog_revision=? AND p.is_active=1 AND p.duplicate_of_product_id IS NULL AND p.source='amazon'
      AND p.source_facts_hash=c.source_facts_hash AND p.source_facts_hash=p.editorial_source_hash
      AND p.editorial_status IN ('generated_ready','manual_locked')
      AND CAST(json_extract(p.source_record_json,'$.editorial_quality_score') AS REAL)>=0.8
      ORDER BY json_extract(p.source_record_json,'$.editorial_generated_at') DESC,p.id LIMIT 500`, params: [identity.catalog_revision] },
    { sql: `SELECT DISTINCT COALESCE(product_id,external_id) product_id FROM catalog_run_items
      WHERE run_id=(SELECT id FROM (${latestCompleted})) ORDER BY product_id LIMIT 501`, params: [] },
  ];
  const results = await request('/query', statements);
  if (!Array.isArray(results) || results.length !== 4 || results.some(result => result.success !== true || !Array.isArray(result.results)
    || result.meta?.rows_written !== 0 || result.meta?.changed_db !== false)) throw new Error('pinterest_catalog_read_invalid');
  const receipt = verifyPinterestPublication(identity, results[0].results);
  const after = await live();
  if (JSON.stringify(identity) !== JSON.stringify(after)) throw new Error('pinterest_catalog_release_changed');
  const latestCatalogRun = results[1].results[0] ?? null;
  return { identity, publicationReceipt: receipt, latestCatalogRun,
    latestRunIds: new Set<string>(results[3].results.map((row: Row) => row.product_id).filter(Boolean)),
    rows: results[2].results.map(normalizePinterestCatalogRow),
    bounds: { sourceRows: 500, runItems: 501, sourceRowsTruncated: results[2].results.length === 500,
      runItemsTruncated: results[3].results.length === 501, requests: 4, statements: 4, reportedRowsWritten: 0 },
    caveat: 'Completed imported enrichment history is provenance, not proof that the new daily writer is enabled. Reverify exact source listing before any future creative.' };
}
