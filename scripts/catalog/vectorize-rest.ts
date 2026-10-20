import type { MutationScope } from '../../lib/catalog/mutation-fence.ts';
import type { SyncVector } from './vector-outbox.ts';
import type { OwnedVectorAdapters } from './owned-vector-delivery.ts';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
/** Explicit protected-workflow wiring only. No ambient credentials, redirects,
 * automatic retries, embedding generation, namespaces, or provider activation.
 * Docs: developers.cloudflare.com/api/resources/vectorize/ (v2 async mutations).
 */
export function createVectorizeRestAdapters(options: MutationScope & {
  accountId: string; token: string; fetch?: typeof fetch; timeoutMs?: number;
}): OwnedVectorAdapters {
  const { accountId,indexName,environment,token } = options; const timeout = options.timeoutMs ?? 2500;
  if (!/^[a-f0-9]{32}$/.test(accountId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(indexName)
    || !['staging','production'].includes(environment) || typeof token !== 'string' || !token.trim()
    || token.length > 4096 || /\s/.test(token) || !Number.isInteger(timeout) || timeout < 10 || timeout > 3000)
    throw new Error('invalid_vectorize_configuration');
  const send = options.fetch ?? fetch;
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${indexName}`;
  async function request(path: string, signal: AbortSignal, body?: string, ndjson = false): Promise<unknown> {
    const controller = new AbortController(); const abort = () => controller.abort();
    signal.addEventListener('abort',abort,{once:true}); if(signal.aborted)controller.abort();
    const timer=setTimeout(abort,timeout);
    try {
      const response=await send(`${base}/${path}`,{method:body===undefined?'GET':'POST',redirect:'error',signal:controller.signal,
        headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':ndjson?'application/x-ndjson':'application/json'})},body});
      if(!response.ok||!response.body)throw new Error();
      const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      try { for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
        if(size>128*1024){await reader.cancel();throw new Error();}chunks.push(part.value);} }
      finally {reader.releaseLock();}
      const bytes=Buffer.concat(chunks);const envelope=JSON.parse(bytes.toString('utf8'));
      if(!envelope||envelope.success!==true||!Object.hasOwn(envelope,'result'))throw new Error();
      return envelope.result;
    } catch { throw new Error('vector_provider_failed'); }
    finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  function id(value:string){if(!UUID.test(value))throw new Error('vector_provider_invalid_id');}
  function vector(value:unknown):SyncVector {
    const v=value as SyncVector;
    if(!v||!UUID.test(v.id)||!Array.isArray(v.values)||v.values.length!==1536
      ||!Array.from(v.values).every(n=>typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(Math.fround(n)))
      ||!v.metadata||typeof v.metadata!=='object'||Array.isArray(v.metadata)
      ||Buffer.byteLength(JSON.stringify(v.metadata))>4096||v.namespace)
      throw new Error('vector_provider_invalid_vector');
    return v;
  }
  const adapters:OwnedVectorAdapters={environment,indexName,providerIdentity:`cloudflare:${accountId}:${indexName}`,
    async dispatch(input,signal){
      id(input.publicId);let body:string;
      if(input.vector){const v=vector(input.vector);if(v.id!==input.publicId)throw new Error('vector_provider_invalid_id');
        // JSON's -0 number is legal, but JSON.stringify silently changes it to0.
        // Keep the sign so the REST bridge does not falsify native-byte parity.
        body=`{"id":${JSON.stringify(v.id)},"values":[${v.values.map(n=>Object.is(n,-0)?'-0':JSON.stringify(n)).join(',')}],"metadata":${JSON.stringify(v.metadata)}}\n`;
      }else body=JSON.stringify({ids:[input.publicId]});
      const result=await request(input.vector?'upsert':'delete_by_ids',signal,body,Boolean(input.vector)) as {mutationId?:unknown};
      if(!result||typeof result.mutationId!=='string'||!UUID.test(result.mutationId))throw new Error('vector_provider_failed');
      return{reference:result.mutationId};
    },
    async resolve(input,signal){
      // REST has no client-delivery-id lookup. A lost mutationId cannot safely
      // be retried, guessed from visible bytes, or resolved by elapsed time.
      if(input.reference===null)return{state:'pending'};
      if(!UUID.test(input.reference))throw new Error('vector_provider_failed');
      const info=await request('info',signal) as {dimensions?:unknown;processedUpToMutation?:unknown};
      if(!info||info.dimensions!==1536)throw new Error('vector_provider_failed');
      return info.processedUpToMutation===input.reference?{state:'settled',reference:input.reference}:{state:'pending'};
    },
    async readback(publicId,signal){
      id(publicId);const result=await request('get_by_ids',signal,JSON.stringify({ids:[publicId]}));
      if(!Array.isArray(result)||result.length>1)throw new Error('vector_provider_failed');
      if(!result.length)return null;
      const found=vector(result[0]);if(found.id!==publicId)throw new Error('vector_provider_failed');
      return structuredClone(found);
    },
  };
  return Object.freeze(adapters);
}
