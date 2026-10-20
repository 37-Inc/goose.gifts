import assert from 'node:assert/strict';
import test from 'node:test';
import { createVectorizeRestAdapters } from '../scripts/catalog/vectorize-rest.ts';
import { nativeHash } from '../scripts/catalog/vector-outbox.ts';

const accountId='a'.repeat(32);const publicId='00000000-0000-4000-8000-000000000001';
const mutationId='11111111-1111-4111-8111-111111111111';
const values=Array(1536).fill(Math.fround(.1));values[0]=-0;values[1]=Math.fround(1e-45);
const vector={id:publicId,values,metadata:{catalogRevision:'test-revision',eligible:true,vectorBytesSha256:nativeHash(values)}};
const signal=()=>new AbortController().signal;
const ok=result=>new Response(JSON.stringify({success:true,result}),{headers:{'Content-Type':'application/json'}});
const config={environment:'staging',indexName:'test-index',accountId,token:'TEST_ONLY_NOT_A_CREDENTIAL'};
const delivery={deliveryId:'b'.repeat(64),attempt:1,publicId,vector};
test('explicit REST bridge binds account/index, preserves negative zero and native bytes, and uses exact-ID readback',async()=>{
  const calls=[];let stored;
  const api=createVectorizeRestAdapters({...config,fetch:async(url,init)=>{
    calls.push({url,init});assert.equal(init.headers.Authorization,`Bearer ${config.token}`);assert.equal(init.redirect,'error');
    if(url.endsWith('/upsert')){stored=JSON.parse(init.body);assert.match(init.body,/"values":\[-0,/);return ok({mutationId});}
    if(url.endsWith('/info'))return ok({dimensions:1536,processedUpToMutation:mutationId});
    assert.ok(url.endsWith('/get_by_ids'));assert.deepEqual(JSON.parse(init.body),{ids:[publicId]});
    // Preserve native zero sign in the mocked HTTP response, just as real JSON
    // transport must do for this explicit exact-byte contract to succeed.
    const body=JSON.stringify({success:true,result:[stored]}).replace('"values":[0,','"values":[-0,');return new Response(body);
  }});
  assert.equal(api.providerIdentity,`cloudflare:${accountId}:test-index`);
  assert.deepEqual(await api.dispatch(delivery,signal()),{reference:mutationId});
  assert.deepEqual(await api.resolve({deliveryId:delivery.deliveryId,attempt:1,reference:mutationId},signal()),{state:'settled',reference:mutationId});
  const actual=await api.readback(publicId,signal());assert.equal(nativeHash(actual.values),nativeHash(vector.values));assert.ok(Object.is(actual.values[0],-0));
  assert.equal(calls.length,3);for(const call of calls)assert.ok(call.url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/test-index/`));
});
test('delete absence uses exact-ID lookup; acceptance alone and different last-processed mutation are pending',async()=>{
  const calls=[];const api=createVectorizeRestAdapters({...config,fetch:async(url,init)=>{calls.push(url);
    if(url.endsWith('/delete_by_ids')){assert.deepEqual(JSON.parse(init.body),{ids:[publicId]});return ok({mutationId});}
    if(url.endsWith('/info'))return ok({dimensions:1536,processedUpToMutation:'22222222-2222-4222-8222-222222222222'});
    return ok([]);
  }});
  assert.deepEqual(await api.dispatch({...delivery,vector:null},signal()),{reference:mutationId});
  assert.deepEqual(await api.resolve({deliveryId:delivery.deliveryId,attempt:1,reference:mutationId},signal()),{state:'pending'});
  const before=calls.length;assert.deepEqual(await api.resolve({deliveryId:delivery.deliveryId,attempt:1,reference:null},signal()),{state:'pending'});
  assert.equal(calls.length,before);assert.equal(await api.readback(publicId,signal()),null);
});
test('unknown writes never retry; HTTP/provider/malformed responses have fixed safe errors',async()=>{
  for(const response of [()=>{throw new Error('PRIVATE_TOKEN_PROVIDER_BODY');},()=>new Response('PRIVATE_SECRET',{status:503}),
    ()=>new Response('not JSON'),()=>ok({mutationId:'not-an-id'}),()=>new Response(JSON.stringify({success:false,errors:[{message:'PRIVATE'}]}))]){
    let calls=0;const api=createVectorizeRestAdapters({...config,fetch:async()=>{calls++;return response();}});
    await assert.rejects(api.dispatch(delivery,signal()),/^Error: vector_provider_failed$/);assert.equal(calls,1);
  }
});
test('bounded timeout/abort and streamed oversized body fail without retry or unbounded allocation',async()=>{
  let calls=0;const api=createVectorizeRestAdapters({...config,timeoutMs:10,fetch:async(_url,init)=>{calls++;
    return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('PRIVATE abort')),{once:true}));}});
  await assert.rejects(api.dispatch(delivery,signal()),/vector_provider_failed/);assert.equal(calls,1);
  let cancelled=false;const oversized=createVectorizeRestAdapters({...config,fetch:async()=>new Response(new ReadableStream({
    pull(controller){controller.enqueue(new Uint8Array(64*1024));},cancel(){cancelled=true;}}))});
  await assert.rejects(oversized.readback(publicId,signal()),/vector_provider_failed/);assert.equal(cancelled,true);
});
test('wrong IDs/namespaces/dimensions and malformed explicit configuration are rejected',async()=>{
  for(const result of [[{...vector,id:'00000000-0000-4000-8000-000000000002'}],[{...vector,namespace:'other'}],
    [{...vector,values:[1,2]}],[vector,vector],{matches:[]},[{...vector,metadata:null}]]){
    const api=createVectorizeRestAdapters({...config,fetch:async()=>ok(result)});await assert.rejects(api.readback(publicId,signal()));
  }
  const api=createVectorizeRestAdapters({...config,fetch:async()=>ok({dimensions:768,processedUpToMutation:mutationId})});
  await assert.rejects(api.resolve({reference:mutationId},signal()));
  for(const override of [{token:''},{accountId:'wrong'},{indexName:'../other'},{environment:'preview'},{timeoutMs:3001}])
    assert.throws(()=>createVectorizeRestAdapters({...config,...override}),/invalid_vectorize_configuration/);
});
