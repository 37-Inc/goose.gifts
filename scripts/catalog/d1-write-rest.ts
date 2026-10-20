import type { CatalogD1, D1Statement } from '../../lib/catalog/storage/d1.ts';

/** Protected Node wiring only; no credentials/bootstrap, schema, lock or runner.
 * REST wire: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
 * Batch contract: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
 * Mocks do NOT prove this REST transport's atomicity; exercise the exact adapter
 * against a disposable database before selecting it for a real writer.
 */
export const CATALOG_D1_REST_LIMITS = Object.freeze({ requests:600,statements:1200,batchStatements:50,parameters:100,
  requestBytes:512*1024,responseBytes:512*1024,timeoutMs:10_000,reportedRowsRead:1_000_000,reportedRowsWritten:10_000 });
type Limits = { [K in keyof typeof CATALOG_D1_REST_LIMITS]:number };
type Param = string | number | null;
type Query = { sql:string;params:readonly Param[] };
type Result<T = Record<string,unknown>> = { success:true;results:T[];meta:Record<string,number|boolean> };
const integer = (value:unknown):value is number => Number.isSafeInteger(value) && Number(value)>=0;
const object = (value:unknown):value is Record<string,unknown> => Boolean(value && typeof value==='object' && !Array.isArray(value));

// One statement per batch member. Ignore delimiters in SQL strings/comments;
// schema/trigger scripts are deliberately not this operational adapter's API.
function sqlText(value:unknown):string {
  if(typeof value!=='string'||!value.trim()||value.includes('\0')||Buffer.byteLength(value)>64*1024)throw new Error('catalog_d1_statement_invalid');
  let token=false,ended=false;
  for(let i=0;i<value.length;i++){
    const c=value[i];if(/\s/.test(c))continue;
    if(value.startsWith('--',i)){const end=value.indexOf('\n',i+2);i=end<0?value.length:end;continue;}
    if(value.startsWith('/*',i)){const end=value.indexOf('*/',i+2);if(end<0)throw new Error('catalog_d1_statement_invalid');i=end+1;continue;}
    if(ended)throw new Error('catalog_d1_statement_invalid');
    if(c===';'){ended=true;continue;}token=true;
    if("'\"`[".includes(c)){
      const close=c==='['?']':c;let closed=false;
      for(i++;i<value.length;i++)if(value[i]===close){if(close!==']'&&value[i+1]===close){i++;continue;}closed=true;break;}
      if(!closed)throw new Error('catalog_d1_statement_invalid');
    }
  }
  if(!token)throw new Error('catalog_d1_statement_invalid');return value;
}

export async function createCatalogD1Rest(options: {
  accountId:string;databaseId:string;databaseName:string;token:string;fetch?:typeof fetch;limits?:Partial<Limits>;
}):Promise<CatalogD1 & { providerIdentity:string;metrics:()=>{
  requests:number;statements:number;reportedRowsRead:number|null;reportedRowsWritten:number|null;unconfirmedRequests:number;
} }> {
  const { accountId,databaseId,databaseName,token }=options;
  const limits={...CATALOG_D1_REST_LIMITS,...options.limits};
  if(typeof accountId!=='string'||!/^[a-f0-9]{32}$/.test(accountId)||typeof databaseId!=='string'
    ||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(databaseId)
    ||typeof databaseName!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(databaseName)
    ||typeof token!=='string'||!token||token.length>4096||/[^\x21-\x7e]/.test(token)
    ||Object.keys(limits).some(key=>!Object.hasOwn(CATALOG_D1_REST_LIMITS,key))
    ||Object.entries(limits).some(([key,value])=>!integer(value)||value<1||value>CATALOG_D1_REST_LIMITS[key as keyof Limits])
    ||limits.timeoutMs<10)throw new Error('catalog_d1_configuration_invalid');
  const send=options.fetch??fetch;
  const base=`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`;
  let requests=0,statements=0,rowsRead=0,rowsWritten=0,unconfirmedRequests=0;
  const bindings=new WeakMap<D1Statement,Query>();
  async function request(body?:string):Promise<unknown> {
    if(requests>=limits.requests)throw new Error('catalog_d1_budget_exhausted');requests++;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    try{
      return await Promise.race([(async()=>{
        const response=await send(body===undefined?base:`${base}/query`,{method:body===undefined?'GET':'POST',redirect:'error',
          signal:controller.signal,headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
          ...(body===undefined?{}:{body})});
        if(controller.signal.aborted||!response.ok||!response.body){void response.body?.cancel().catch(()=>{});throw new Error();}
        reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
        try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
          if(size>limits.responseBytes){await reader.cancel();throw new Error();}chunks.push(part.value);}}
        finally{reader.releaseLock();}
        const envelope:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(!object(envelope)||envelope.success!==true||!Object.hasOwn(envelope,'result'))throw new Error();
        return envelope.result;
      })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
        controller.abort();void reader?.cancel().catch(()=>{});reject(new Error());
      },limits.timeoutMs);})]);
    }catch{throw new Error(body===undefined?'catalog_d1_identity_unavailable':'catalog_d1_result_unknown');}
    finally{clearTimeout(timer);}
  }
  async function query(batch:Query[]):Promise<Result[]> {
    if(!batch.length||batch.length>limits.batchStatements)throw new Error('catalog_d1_batch_invalid');
    const body=JSON.stringify({batch});
    if(Buffer.byteLength(body)>limits.requestBytes)throw new Error('catalog_d1_request_bound');
    if(statements+batch.length>limits.statements||requests>=limits.requests
      ||rowsRead>=limits.reportedRowsRead||rowsWritten>=limits.reportedRowsWritten)throw new Error('catalog_d1_budget_exhausted');
    statements+=batch.length;
    let results:Result[];
    try{
      const raw=await request(body);
      if(!Array.isArray(raw)||raw.length!==batch.length)throw new Error();
      results=raw.map(value=>{
        if(!object(value)||value.success!==true||!Array.isArray(value.results)||value.results.some(row=>!object(row))
          ||!object(value.meta)||value.meta.served_by_primary!==true||!integer(value.meta.rows_read)||!integer(value.meta.rows_written))throw new Error();
        const meta:Record<string,number|boolean>={served_by_primary:true,rows_read:value.meta.rows_read,rows_written:value.meta.rows_written};
        for(const key of ['changes','last_row_id','duration'])if(value.meta[key]!==undefined){
          const n=value.meta[key];if(typeof n!=='number'||!Number.isFinite(n)||key!=='duration'&&!Number.isSafeInteger(n)
            ||key!=='last_row_id'&&n<0)throw new Error();meta[key]=n;
        }
        return {success:true as const,results:value.results,meta};
      });
    }catch{unconfirmedRequests++;throw new Error('catalog_d1_result_unknown');}
    const read=results.reduce((sum,result)=>sum+Number(result.meta.rows_read),rowsRead);
    const written=results.reduce((sum,result)=>sum+Number(result.meta.rows_written),rowsWritten);
    if(!Number.isSafeInteger(read)||!Number.isSafeInteger(written)){
      unconfirmedRequests++;throw new Error('catalog_d1_result_unknown');
    }
    rowsRead=read;rowsWritten=written;
    // Reported costs are checked AFTER execution, never a guarantee that an
    // arbitrary SQL query cannot exceed its allowance. Lost metadata stays
    // unknown; bounded requests still permit the caller's journal readback.
    if(rowsRead>limits.reportedRowsRead
      ||rowsWritten>limits.reportedRowsWritten)throw new Error('catalog_d1_reported_usage_exceeded');
    return results;
  }
  const identity=await request();
  if(!object(identity)||identity.uuid!==databaseId||identity.name!==databaseName||!object(identity.read_replication)
    ||identity.read_replication.mode!=='disabled')throw new Error('catalog_d1_identity_mismatch');
  // Disabled replication alone is insufficient during its documented drain
  // window. Require this read AND every subsequent response to prove primary.
  const probe=(await query([{sql:'SELECT 1 AS catalog_d1_primary',params:[]}]))[0];
  if(probe.results.length!==1||probe.results[0].catalog_d1_primary!==1||probe.meta.rows_written!==0)
    throw new Error('catalog_d1_primary_unproven');
  function statement(sql:string,params:readonly Param[]=[]):D1Statement {
    const value:D1Statement=Object.freeze({
      bind(...values:unknown[]){
        if(values.length>limits.parameters||values.some(v=>v!==null&&typeof v!=='string'
          &&(typeof v!=='number'||!Number.isFinite(v)||Number.isInteger(v)&&!Number.isSafeInteger(v))))
          throw new Error('catalog_d1_parameters_invalid');
        return statement(sql,Object.freeze(values.slice() as Param[]));
      },
      async all<T>(){return (await query([bindings.get(value)!]))[0] as Result<T>;},
      async run(){return (await query([bindings.get(value)!]))[0];},
    });bindings.set(value,{sql,params});return value;
  }
  return Object.freeze({providerIdentity:`cloudflare:${accountId}:${databaseId}`,
    metrics:()=>({requests,statements,reportedRowsRead:unconfirmedRequests?null:rowsRead,
      reportedRowsWritten:unconfirmedRequests?null:rowsWritten,unconfirmedRequests}),
    prepare:(sql:string)=>statement(sqlText(sql)),
    batch(values:D1Statement[]){
      if(!Array.isArray(values)||Array.from(values).some(value=>!bindings.has(value)))return Promise.reject(new Error('catalog_d1_batch_invalid'));
      return query(Array.from(values,value=>bindings.get(value)!));
    },
  });
}
