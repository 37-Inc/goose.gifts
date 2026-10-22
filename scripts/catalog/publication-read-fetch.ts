import { createHash, randomUUID } from 'node:crypto';
import type { RunWorkspace } from './run-workspace.ts';

interface ReadScope { accountId:string;workerName:string;indexName:string;databaseId:string;identityOrigin:string }
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const owned=new WeakSet<typeof fetch>();
export function isAccountedPublicationReadFetch(send:typeof fetch|undefined):boolean { return !!send&&owned.has(send); }

/** READ-only companion wiring. The raw sender never receives ledger callbacks:
 * late responses cannot settle twice or write after this promise has finished.
 * Network time is bounded; our own durable reservation/settlement is awaited.
 */
export function accountedPublicationReadFetch(ws:Pick<RunWorkspace,'reserveBudget'|'settleBudget'>,send:typeof fetch,scope:ReadScope):typeof fetch {
  if(!/^[a-f0-9]{32}$/.test(scope.accountId)||!UUID.test(scope.databaseId)
    ||![scope.workerName,scope.indexName].every(n=>/^[a-zA-Z0-9_-]{1,100}$/.test(n))
    ||new URL(scope.identityOrigin).origin!==scope.identityOrigin||!scope.identityOrigin.startsWith('https://'))throw new Error('publication_read_scope_invalid');
  const account=`/client/v4/accounts/${scope.accountId}`,worker=`${account}/workers/scripts/${scope.workerName}`,
    vector=`${account}/vectorize/v2/indexes/${scope.indexName}`;
  const read:typeof fetch=async(input,init)=>{
    if(typeof input!=='string'||init?.redirect!=='error')throw new Error('publication_read_scope_invalid');
    const url=new URL(input),method=init.method??'GET';
    const get=method==='GET'&&init.body===undefined&&(url.origin===scope.identityOrigin&&url.pathname==='/.well-known/catalog-release.json'
      ||url.origin==='https://api.cloudflare.com'&&[`${worker}/deployments`,vector,`${vector}/info`,`${account}/d1/database/${scope.databaseId}`].includes(url.pathname)
      ||url.origin==='https://api.cloudflare.com'&&url.pathname.startsWith(`${worker}/versions/`)&&UUID.test(url.pathname.slice(`${worker}/versions/`.length)));
    let native=false;
    if(method==='POST'&&url.origin==='https://api.cloudflare.com'&&url.pathname===`${vector}/get_by_ids`&&typeof init.body==='string'&&Buffer.byteLength(init.body)<=4096){
      try{const body=JSON.parse(init.body);native=Object.keys(body).join(',')==='ids'&&Array.isArray(body.ids)&&body.ids.length>0&&body.ids.length<=10
        &&body.ids.every((id:unknown)=>typeof id==='string'&&UUID.test(id))&&new Set(body.ids).size===body.ids.length;}catch{}
    }
    if(!get&&!native||url.username||url.password||url.search||url.hash)throw new Error('publication_read_scope_invalid');
    init.signal?.throwIfAborted();const controller=new AbortController();
    let rejectAbort:(error:Error)=>void=()=>{};
    const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
    const abort=()=>{controller.abort();rejectAbort(new Error('publication_read_aborted'));};
    init.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,10_000);
    // Observe rejection even while an asynchronous durable reservation is pending.
    void aborted.catch(()=>{});
    try{
      const id=randomUUID();await ws.reserveBudget({id,requestSha256:createHash('sha256').update(JSON.stringify({url:input,method,body:init.body??null})).digest('hex'),
        units:{httpRequests:1,sqlStatements:0}});
      let response:Response;
      try{
        controller.signal.throwIfAborted();
        const pending=send(input,{...init,signal:controller.signal}).then(value=>{
          if(controller.signal.aborted){void value.body?.cancel().catch(()=>{});throw new Error('publication_read_aborted');}return value;});
        response=await Promise.race([pending,aborted]);
      }catch{
        await ws.settleBudget(id,{status:'unknown',usage:null});throw new Error('publication_read_unavailable');
      }
      // Settlement failure is not retried or relabelled as a second settlement.
      await ws.settleBudget(id,{status:'known',usage:{rowsRead:0,rowsWritten:0}});return response;
    }finally{clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
  };
  owned.add(read);return read;
}
