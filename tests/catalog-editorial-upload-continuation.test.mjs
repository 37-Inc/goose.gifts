import test from 'node:test';
import assert from 'node:assert/strict';
import {editorialUploadContinuation} from '../scripts/catalog/editorial-upload-continuation.mts';

test('continuation help is offline and cannot start a batch or extend a deadline',async()=>{
  const help=await editorialUploadContinuation(['--help']);
  assert.match(help.usage,/prepare --controller-sha .*publish --controller-sha .*--approve/);
  assert.match(help.authority,/no new batch/);assert.doesNotMatch(help.usage,/start|reset|cutoff|force|adopt/);
});
test('continuation rejects invalid arguments before credentials or workspace work',async()=>{
  for(const args of [[],['start'],['publish'],['prepare'],['--help','extra'],['publish','--controller-sha','x','--force','y']])
    await assert.rejects(editorialUploadContinuation(args),/editorial_upload_arguments/);
});
