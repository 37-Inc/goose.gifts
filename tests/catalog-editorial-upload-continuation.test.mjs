import test from 'node:test';
import assert from 'node:assert/strict';
import {editorialUploadContinuation} from '../scripts/catalog/editorial-upload-continuation.mts';
import {editorialTransportContinuation} from '../scripts/catalog/editorial-transport-continuation.mts';

test('continuation help is offline and cannot start a batch or extend a deadline',async()=>{
  const help=await editorialUploadContinuation(['--help']);
  assert.match(help.usage,/prepare --controller-sha .*publish --controller-sha .*--approve/);
  assert.match(help.authority,/no new batch/);assert.doesNotMatch(help.usage,/start|reset|cutoff|force|adopt/);
});

test('transport help/argument validation is offline and grants no batch, budget, lease or deadline',async()=>{
  const help=await editorialTransportContinuation(['--help']);assert.match(help.authority,/two proven read-only failures/);
  assert.doesNotMatch(help.usage,/start|force|reset|cutoff|budget/);
  for(const args of [[],['start'],['prepare'],['publish'],['publish','--controller-sha','x','--force','x']])
    await assert.rejects(editorialTransportContinuation(args),/editorial_transport_arguments/);
});
test('continuation rejects invalid arguments before credentials or workspace work',async()=>{
  for(const args of [[],['start'],['publish'],['prepare'],['--help','extra'],['publish','--controller-sha','x','--force','y']])
    await assert.rejects(editorialUploadContinuation(args),/editorial_upload_arguments/);
});
