import assert from 'node:assert/strict';
import test from 'node:test';
import { headroom } from '../scripts/catalog/daily-operator.mjs';

const usage = (rowsRead, rowsWritten) => async url => {
  assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
  return Response.json({data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:[{sum:{rowsRead,rowsWritten}}]}]}}});
};
test('routine Free admission includes remaining work, uncertainty, and untouched shared headroom',async()=>{
  const result=await headroom('synthetic',undefined,null,usage(2_000_000,20_000));
  assert.equal(result.rowsRead,2_000_000);
  assert.equal(result.untouchedReads,300_000);
  await assert.rejects(headroom('synthetic',undefined,null,usage(2_700_000,20_000)),/free_headroom/);
  await assert.rejects(headroom('synthetic',undefined,null,usage(2_000_000,56_000)),/free_headroom/);
});
test('settled work is not double charged but delayed analytics cannot erase it',async()=>{
  const spent={knownRowsRead:100_000,knownRowsWritten:1_000};
  await headroom('synthetic',spent,{rowsRead:2_000_000,rowsWritten:20_000},usage(2_100_000,21_000));
  await assert.rejects(headroom('synthetic',spent,{rowsRead:2_700_000,rowsWritten:20_000},usage(0,0)),/free_headroom/);
});
test('missing, malformed, exceeded or uncertain usage cannot authorize provider work',async()=>{
  for(const [read,write]of [[null,0],[0,null],[-1,0],[0,-1],[Number.MAX_SAFE_INTEGER+1,0]])
    await assert.rejects(headroom('synthetic',undefined,null,usage(read,write)),/headroom_invalid/);
  for(const spent of [{knownRowsRead:-1,knownRowsWritten:0},{knownRowsRead:1_500_001,knownRowsWritten:0},
    {knownRowsRead:0,knownRowsWritten:0,unconfirmedRequests:2}])
    await assert.rejects(headroom('synthetic',spent,null,usage(0,0)),/run_budget_exceeded/);
});
