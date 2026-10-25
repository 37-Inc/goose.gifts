import test from 'node:test';
import assert from 'node:assert/strict';
import {validateActivatedFinalizationConsent} from '../scripts/catalog/editorial-finish-recovery.mts';

const consent={schemaVersion:1,scope:'roadmap-lbbz1.4.9/activated-finalization',approvedAt:new Date().toISOString(),
  checkpointSha256:'129b9b843037dc866241b55dff9b42805ad3518fd8340818d19c8685662a438f',
  versionReference:'97aedc42-2321-416c-b349-014e13dba563',deploymentId:'781f25c8-3b81-42a0-8b32-d48ea5d1f501',
  additionalHttpRequests:1000,additionalSqlStatements:8000,additionalRowsRead:500000,minimumUntouchedAccountReads:300000,
  newProductFetches:0,newModelCalls:0,newBuildUploads:0,paidUpgrade:false};
test('activated finalization consent pins the real existing release and bounded control-only scope',()=>{
  assert.deepEqual(validateActivatedFinalizationConsent(consent),consent);
  for(const patch of [{scope:'same-upload-finish'},{checkpointSha256:'a'.repeat(64)},{versionReference:'other'},
    {deploymentId:'other'},{additionalHttpRequests:1001},{additionalSqlStatements:8001},{additionalRowsRead:500001},
    {minimumUntouchedAccountReads:0},{newProductFetches:1},{newModelCalls:1},{newBuildUploads:1},{paidUpgrade:true},
    {approvedAt:new Date(Date.now()+3600000).toISOString()},{skipProof:true}])
    assert.throws(()=>validateActivatedFinalizationConsent({...consent,...patch}),/finalization_authority/);
  assert.throws(()=>validateActivatedFinalizationConsent(null),/finalization_authority/);
});
