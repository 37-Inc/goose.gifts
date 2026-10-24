import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryCommand} from '../scripts/catalog/editorial-recovery-command.mts';

test('recovery help is offline and exposes no provider or new-batch command',async()=>{
  const result=await recoveryCommand(['--help']);
  assert.match(result.usage,/prepare .*adopt\|capture\|review\|repair\|publish\|reconcile/);
  assert.match(result.authority,/explicit live approval/);
  assert.doesNotMatch(result.usage,/start|discover|enrich|reset|release-owner/);
});

test('invalid recovery arguments reject before workspace or credential access',async()=>{
  for(const args of [[],['start'],['capture'],['prepare'],['--help','extra'],
    ['capture','--job','unused','--job-sha256'],['publish','--job','unused','--job-sha256','0','--force','yes']]){
    await assert.rejects(recoveryCommand(args),/^Error: editorial_command_arguments$/);
  }
});
