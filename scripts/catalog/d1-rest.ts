/** Read-only operator inspection, NOT a CatalogD1 mutation backend.
 * REST wire: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
 * Binding batch rollback: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
 * That binding guarantee is not independent acceptance of a new REST write path.
 * Only the fixed SELECT/metadata PRAGMA statements below can reach /query.
 */
export const RUNNER_COLUMNS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  products: ['public_id','slug','source_record_json','rights_json','public_display_json','eligible_until','timestamp_provenance_json'],
  catalog_revisions: ['revision','status','source_export_sha256','abandonment_delivery_id','abandonment_epoch'],
  catalog_public_products: ['public_id','catalog_revision','public_display_json','eligible_until'],
  catalog_projection_receipts: ['catalog_revision','snapshot_sha256','projection_sha256','source_export_sha256'],
  product_slug_history: ['slug','product_id'],
  vector_sync_outbox: ['sequence','public_id','source_revision','status','attempts','lease_token','mutation_reference','delete_mutation_sha256'],
  vector_delete_mutations: ['mutation_sha256','mutation_json'],
  catalog_mutation_scopes: ['environment','index_name','phase','generation','mutation_epoch','external_pending','owner_token','activation_request_id'],
  catalog_maintenance_products: ['product_id','version','semantic_json','embedding_native_base64','embedding_provenance_json'],
  catalog_maintenance_operations: ['operation_id','input_sha256','run_id','prior_epoch','next_epoch','changes_json'],
  catalog_maintenance_vector_payloads: ['sequence','operation_id','payload_json'],
  catalog_vector_deliveries: ['delivery_id','request_json','status','disposition','dispatch_token','mutation_reference','evidence_json'],
  catalog_runs: ['id','status','source_record_json'], catalog_run_items: ['id','run_id','source_record_json'],
  catalog_run_telemetry: ['run_id','start_json','finish_json'],
  catalog_build_requests: ['request_id','environment','state','request_json'],
  publication_outbox: ['release_id','intent_json','state'], publication_receipts: ['release_id','catalog_revision','manifest_json'],
});
const QUERIES: Readonly<Record<string, string>> = Object.freeze({
  capabilities: `SELECT sqlite_version() sqlite_version,json_valid('{}') valid_json,
    strftime('%Y-%m-%dT%H:%M:%fZ','2024-02-30T00:00:00.000Z','+0 days') normalized_date`,
  schema: `SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN('table','index','trigger')
    AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 201`,
  ownership: `SELECT environment,index_name,phase,generation,mutation_epoch,external_pending FROM catalog_mutation_scopes LIMIT 2`,
  pending: `SELECT EXISTS(SELECT 1 FROM vector_sync_outbox WHERE status!='complete') vector_work,
    EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE status='pending') vector_deliveries,
    EXISTS(SELECT 1 FROM catalog_build_requests WHERE state IN('pending','building','activating')) builds,
    EXISTS(SELECT 1 FROM catalog_runs WHERE status='running') runs`,
  ...Object.fromEntries(Object.keys(RUNNER_COLUMNS).map(table => [`columns:${table}`, `PRAGMA table_info(${table})`])),
});
export type ReadRow = Record<string, unknown>;
type QueryResult = { success: true; results: ReadRow[]; meta?: Record<string, unknown> };

export function createCloudflareReadClient(options: {
  accountId: string; databaseId: string; indexName: string; token: string; fetch?: typeof fetch; timeoutMs?: number;
}) {
  const { accountId,databaseId,indexName,token } = options;
  const timeout = options.timeoutMs ?? 5000;
  if (typeof accountId!=='string' || !/^[a-f0-9]{32}$/.test(accountId) || typeof databaseId!=='string'
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(databaseId)
    || typeof indexName!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(indexName) || typeof token !== 'string' || !token || token.length > 4096
    || /[^\x21-\x7e]/.test(token) || !Number.isInteger(timeout) || timeout < 10 || timeout > 10000)
    throw new Error('cloudflare_read_configuration');
  const send = options.fetch ?? fetch;
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  let requests = 0, rowsRead = 0, rowsWritten = 0, readMetadataComplete = true, writeMetadataComplete = true;
  async function request(path: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    try {
      return await Promise.race([(async () => {
        requests++;
        const response = await send(`${base}/${path}`, { method: body === undefined ? 'GET' : 'POST', redirect:'error',
          signal:controller.signal, headers:{Authorization:`Bearer ${token}`,...(body === undefined ? {} : {'Content-Type':'application/json'})},
          ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
        if (!response.ok || !response.body) throw new Error();
        reader=response.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
        try { for (;;) { const part=await reader.read(); if (part.done) break; size+=part.value.byteLength;
          if (size>512*1024) { await reader.cancel(); throw new Error(); } chunks.push(part.value); } }
        finally { reader.releaseLock(); }
        const envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!envelope || envelope.success!==true || !Object.hasOwn(envelope,'result')) throw new Error();
        return envelope.result;
      })(), new Promise<never>((_,reject) => { timer=setTimeout(() => {
        controller.abort(); void reader?.cancel().catch(() => {}); reject(new Error());
      },timeout); })]);
    } catch { throw new Error('cloudflare_read_unavailable'); }
    finally { clearTimeout(timer); }
  }
  return Object.freeze({
    database: () => request(`d1/database/${databaseId}`),
    vectorIndex: () => request(`vectorize/v2/indexes/${indexName}`),
    async read(names: readonly string[]): Promise<QueryResult[]> {
      if (!Array.isArray(names) || !names.length || names.length>32 || names.some(name => !Object.hasOwn(QUERIES,name)))
        throw new Error('cloudflare_read_query_refused');
      const batch=names.map(name => ({sql:QUERIES[name],params:[]}));
      // One documented batch request, not one HTTP request per statement.
      const result=await request(`d1/database/${databaseId}/query`,{batch}) as QueryResult[];
      if (!Array.isArray(result) || result.length!==names.length || result.some(value => !value || value.success!==true
        || !Array.isArray(value.results) || value.results.some(row => !row || typeof row!=='object' || Array.isArray(row))
        || value.meta?.changed_db!==undefined && value.meta.changed_db!==false
        || value.meta?.rows_written!==undefined && value.meta.rows_written!==0
        || value.meta?.rows_read!==undefined && (!Number.isSafeInteger(value.meta.rows_read) || Number(value.meta.rows_read)<0)))
        throw new Error('cloudflare_read_result_invalid');
      for (const value of result) {
        if (Number.isFinite(value.meta?.rows_read)) rowsRead+=Number(value.meta!.rows_read); else readMetadataComplete=false;
        if (Number.isFinite(value.meta?.rows_written)) rowsWritten+=Number(value.meta!.rows_written); else writeMetadataComplete=false;
      }
      return result;
    },
    metrics: () => ({requests,reportedRowsRead:readMetadataComplete?rowsRead:null,reportedRowsWritten:writeMetadataComplete?rowsWritten:null}),
  });
}
