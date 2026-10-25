import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicationFinishAuthority} from '../lib/catalog/build-requests.ts';
const cutoff='2026-10-24T23:00:00.000Z',version='97aedc42-2321-416c-b349-014e13dba563';
const good={authorizationSha256:'a'.repeat(64),reviewedAt:'2026-10-25T05:00:00.000Z',activationDeadline:'2026-10-25T07:00:00.000Z',versionReference:version};
test('fresh finish authority keeps original cutoff while binding canonical two-hour deadline and same immutable version',()=>{
  assert.equal(validatePublicationFinishAuthority(good,cutoff,version),good.activationDeadline);
  for(const change of [{authorizationSha256:'unapproved'},{reviewedAt:'not-a-date'},{activationDeadline:'not-a-date'},
    {activationDeadline:'2026-10-25T07:00:00Z'},{reviewedAt:'2026-10-24T22:00:00.000Z'},
    {activationDeadline:'2026-10-25T07:00:00.001Z'},{activationDeadline:good.reviewedAt},{versionReference:'other'},{extra:true}])
    assert.throws(()=>validatePublicationFinishAuthority({...good,...change},cutoff,version));
});
