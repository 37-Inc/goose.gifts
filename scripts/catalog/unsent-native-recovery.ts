import { canonicalJson, sha256 } from './migration.ts';
import { createHash } from 'node:crypto';
import { mutationFenceQuery } from '../../lib/catalog/mutation-fence.ts';
import type { MutationOwner, MutationQuery } from '../../lib/catalog/mutation-fence.ts';
import { decodePgvectorSendBase64 } from './pgvector-binary.ts';

const HASH = /^[a-f0-9]{64}$/;
const OUTBOX = 'attempts,completed_at,created_at,delete_mutation_sha256,embedding_text_hash,error_code,lease_token,lease_until,mutation_reference,operation,public_id,sequence,source_revision,status';
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
type QueueRow = Record<string, string | number | null>;

/** Build (NEVER execute) one atomic reconciliation of an unequivocally UNSENT
 * erroneous delete. Keep its complete row in immutable operation history, its
 * original payload, native bytes and every product unchanged. No provider claim,
 * ownership release, successful-publication marker or credential is produced.
 * The future caller must account the batch in the ORIGINAL run and fresh-CAS
 * the preparation's config/checkpoint/journal/public identity before execution.
 */
export function prepareUnsentNativeReconciliation(input: {
  owner: MutationOwner; runId: string; configSha256: string; checkpointSha256: string;
  journalSha256: string; reviewReference: string; queueRow: QueueRow;
  sourceOperationId: string; payloadJson: string; productId: string;
  nativeBase64: string; provenanceJson: string;
}) {
  const row=input.queueRow, owner=input.owner;
  const fence=mutationFenceQuery(owner);
  if (owner.phase!=='writing' || owner.ownerReference!==input.runId || !input.reviewReference?.trim()
    || input.reviewReference.length>200 || ![input.configSha256,input.checkpointSha256,input.journalSha256,input.sourceOperationId].every(v=>HASH.test(v))
    || !row || Object.keys(row).sort().join(',')!==OUTBOX || !Number.isSafeInteger(row.sequence) || Number(row.sequence)<1
    || row.source_revision!==input.runId || row.operation!=='delete' || row.status!=='pending' || row.attempts!==0
    || ['completed_at','lease_token','lease_until','mutation_reference','error_code'].some(k=>row[k]!==null))
    throw new Error('unsent_native_recovery_input');
  decodePgvectorSendBase64(input.nativeBase64); // Native contract stays1536; no shortening here.
  const provenance=JSON.parse(input.provenanceJson),payload=JSON.parse(input.payloadJson);
  if (!provenance || typeof provenance!=='object' || !payload || payload.sequence!==row.sequence
    || payload.publicId!==row.public_id || payload.catalogRevision!==input.runId || payload.operation!=='delete')
    throw new Error('unsent_native_recovery_payload');
  const request={...input,ownerSha256:sha256(canonicalJson(owner)),nativeSha256:createHash('sha256').update(Buffer.from(input.nativeBase64,'base64')).digest('hex'),
    payloadSha256:sha256(input.payloadJson),provenanceSha256:sha256(input.provenanceJson)};
  // Existing immutable/native stores retain the bodies. Audit hashes/references
  // rather than duplicating owner tokens or model-input bodies in another log.
  const {owner:unused,nativeBase64:unusedNative,provenanceJson:unusedProof,payloadJson:unusedPayload,...audit}=request;
  void unused;void unusedNative;void unusedProof;void unusedPayload;
  const inputSha256=sha256(canonicalJson(audit)),operationId=sha256(`${input.runId}:${inputSha256}`);
  const nextOwner={...owner,epoch:owner.epoch+1},nextFence=mutationFenceQuery(nextOwner);
  const result={kind:'unsent-native-preserved',sequence:row.sequence,providerDispatches:0,reconciliation:audit};
  const assertion=(sql:string,params:unknown[]=[]):MutationQuery=>({
    sql:`SELECT json(CASE WHEN ${sql} THEN 'true' ELSE 'unsent_native_recovery_conflict' END)`,params});
  const nativeSql=`EXISTS(SELECT 1 FROM products p JOIN catalog_maintenance_products m ON m.product_id=p.id
    WHERE p.id=? AND p.public_id=? AND m.embedding_present=1 AND m.embedding_native_base64 IS ? AND m.embedding_provenance_json IS ?)`;
  const nativeParams=[input.productId,row.public_id,input.nativeBase64,input.provenanceJson];
  const payloadSql=`EXISTS(SELECT 1 FROM catalog_maintenance_vector_payloads p JOIN catalog_maintenance_operations o ON o.operation_id=p.operation_id
    WHERE p.sequence=? AND p.operation_id=? AND p.payload_json IS ? AND o.run_id=?
      AND o.environment=? AND o.index_name=? AND o.generation=? AND o.next_epoch<=?)`;
  const payloadParams=[row.sequence,input.sourceOperationId,input.payloadJson,input.runId,owner.environment,owner.indexName,owner.generation,owner.epoch];
  const keys=Object.keys(row);
  const queries:MutationQuery[]=[
    assertion(fence.sql,fence.params),
    assertion(`(SELECT count(*) FROM vector_sync_outbox WHERE status='pending')=1
      AND NOT EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE status='pending')
      AND NOT EXISTS(SELECT 1 FROM catalog_build_requests WHERE state NOT IN('resolved','failed'))`),
    assertion(`EXISTS(SELECT 1 FROM vector_sync_outbox WHERE ${keys.map(k=>`${k} IS ?`).join(' AND ')})`,keys.map(k=>row[k])),
    assertion(nativeSql,nativeParams),assertion(payloadSql,payloadParams),
    {sql:`INSERT INTO catalog_maintenance_operations(operation_id,input_sha256,run_id,catalog_revision,environment,index_name,
      generation,prior_epoch,next_epoch,database_time,result_json,changes_json) VALUES(?,?,?,?,?,?,?,?,?,${NOW},?,?)`,
    params:[operationId,inputSha256,input.runId,input.runId,owner.environment,owner.indexName,owner.generation,owner.epoch,nextOwner.epoch,
      // Control-only: product proof readers must not mistake this for a new
      // product mutation with a missing afterSha256/privateStateSha256.
      canonicalJson(result),'[]']},
    {sql:'DELETE FROM vector_sync_outbox WHERE sequence=?',params:[row.sequence]},
    assertion('NOT EXISTS(SELECT 1 FROM vector_sync_outbox WHERE sequence=?)',[row.sequence]),
    assertion(nativeSql,nativeParams),assertion(payloadSql,payloadParams),
    {sql:`UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1 WHERE ${fence.sql}
      AND EXISTS(SELECT 1 FROM catalog_maintenance_operations WHERE operation_id=? AND input_sha256=?)`,
    params:[...fence.params,operationId,inputSha256]},
    assertion(nextFence.sql,nextFence.params),
  ];
  if (queries.some(q=>q.params.length>100)||Buffer.byteLength(canonicalJson(queries))>384*1024)
    throw new Error('unsent_native_recovery_bound');
  return {operationId,inputSha256,nextOwner,queries,executionAuthorized:false as const};
}
