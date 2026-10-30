import type {CatalogD1} from '../../lib/catalog/storage/d1.ts';
import type {MutationOwner} from '../../lib/catalog/mutation-fence.ts';
import {mutationAssertion,mutationAdvance,readMutationOwner} from '../../lib/catalog/mutation-fence.ts';
import {canonicalJson,sha256} from './migration.ts';

/** An expired, never-published control plan may be withdrawn without deleting
 * projection/history rows or pretending a native mutation occurred. */
export async function withdrawUnpublishedCohort(db:CatalogD1,owner:MutationOwner,input:{catalogRevision:string;
  projectionReceipt:Record<string,unknown>;cutoff:string;approvalReference:string}){
  if(owner.phase!=='freezing'||!/^[a-zA-Z0-9._-]{1,64}$/.test(input.catalogRevision)
    ||input.projectionReceipt.catalog_revision!==input.catalogRevision
    ||!/^[a-f0-9]{64}$/.test(String(input.projectionReceipt.source_export_sha256))
    ||!/^[a-f0-9]{64}$/.test(input.approvalReference)||new Date(input.cutoff).toISOString()!==input.cutoff)
    throw Error('catalog_withdrawal_invalid');
  const request={kind:'catalog-withdrawal',...input},bytes=canonicalJson(request);
  const id=sha256(canonicalJson({request,scope:{environment:owner.environment,indexName:owner.indexName},generation:owner.generation,operationKey:owner.operationKey}));
  const next={...owner,epoch:owner.epoch+1};
  const assert=(sql:string,params:unknown[]=[])=>db.prepare(`SELECT json(CASE WHEN ${sql} THEN 'true' ELSE 'catalog_withdrawal_changed' END)`).bind(...params);
  const marker={sql:'SELECT 1 FROM catalog_revisions WHERE revision=? AND abandonment_delivery_id=? AND abandonment_epoch=?',params:[input.catalogRevision,id,next.epoch]};
  const saved=(await db.prepare('SELECT request_json FROM catalog_vector_deliveries WHERE delivery_id=?').bind(id).all()).results;
  if(saved.length){
    if(saved.length!==1||saved[0].request_json!==bytes)throw Error('catalog_withdrawal_changed');
    await db.batch([mutationAssertion(db,next,['freezing']),assert(`EXISTS(${marker.sql})`,marker.params)]);return next;
  }
  const keys=Object.keys(input.projectionReceipt);
  if(keys.some(k=>!/^[a-z_][a-z0-9_]*$/.test(k))||keys.length>20)throw Error('catalog_withdrawal_invalid');
  await db.batch([mutationAssertion(db,owner,['freezing']),
    assert(`?<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND NOT EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE status!='complete')
      AND NOT EXISTS(SELECT 1 FROM catalog_build_requests WHERE source_revision=?)
      AND NOT EXISTS(SELECT 1 FROM publication_outbox WHERE catalog_revision=?)
      AND NOT EXISTS(SELECT 1 FROM publication_receipts WHERE catalog_revision=?)
      AND EXISTS(SELECT 1 FROM catalog_projection_receipts WHERE ${keys.map(k=>`${k} IS ?`).join(' AND ')})
      AND EXISTS(SELECT 1 FROM catalog_revisions WHERE revision=? AND source_export_sha256=? AND status='importing' AND abandonment_delivery_id IS NULL)`,
      [input.cutoff,input.catalogRevision,input.catalogRevision,input.catalogRevision,...keys.map(k=>input.projectionReceipt[k]),input.catalogRevision,input.projectionReceipt.source_export_sha256]),
    db.prepare(`INSERT INTO catalog_vector_deliveries(delivery_id,environment,index_name,generation,prior_epoch,owner_json,request_json,product_json,
      status,disposition,evidence_json,completed_at) VALUES(?,?,?,?,?,?,?,'{}','complete','expired_unsubmitted',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
      .bind(id,owner.environment,owner.indexName,owner.generation,owner.epoch,canonicalJson(owner),bytes,
        canonicalJson([{state:'publication_window_expired',reference:input.approvalReference}])),
    db.prepare('UPDATE catalog_revisions SET abandonment_delivery_id=?,abandonment_epoch=? WHERE revision=? AND abandonment_delivery_id IS NULL')
      .bind(id,next.epoch,input.catalogRevision),assert(`EXISTS(${marker.sql})`,marker.params),
    mutationAdvance(db,owner,marker),mutationAssertion(db,next,['freezing'])]);
  const actual=await readMutationOwner(db,next);
  if(canonicalJson(actual)!==canonicalJson(next))throw Error('catalog_withdrawal_unconfirmed');return next;
}
