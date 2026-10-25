import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareEditorialRepair,editorialRepairSha256} from './editorial-recovery.ts';
import type {EditorialRecoveryContext,EditorialRecoveryCapture} from './editorial-recovery.ts';
import {sha256} from './migration.ts';

/** Read-only planner. No live mode, credentials, workspace opening, file writes,
 * owner/counter changes or backdated override. A hash report is NOT approval. */
export async function reviewEditorialRecoveryFiles(args:string[],now=()=>new Date().toISOString()){
  if(args.length!==8||args[0]!=='--context'||args[2]!=='--context-sha256'||args[4]!=='--capture'||args[6]!=='--capture-sha256')throw Error('editorial_offline_arguments');
  async function read(file:string,hash:string){
    const path=resolve(file),s=await lstat(path);
    if(!/^[a-f0-9]{64}$/.test(hash)||await realpath(path)!==path||!s.isFile()||s.isSymbolicLink()||s.nlink!==1
      ||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o600||s.size>32*1024*1024)throw Error('editorial_offline_private_file');
    const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const actual=await fd.stat();if(actual.ino!==s.ino||actual.dev!==s.dev||actual.size!==s.size||actual.nlink!==1||actual.uid!==s.uid||(actual.mode&0o777)!==0o600)throw Error('editorial_offline_file_changed');
      const bytes=await fd.readFile();if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('editorial_offline_digest');
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    }finally{await fd.close();}
  }
  const context=await read(args[1],args[3]) as EditorialRecoveryContext,capture=await read(args[5],args[7]) as EditorialRecoveryCapture;
  const plan=prepareEditorialRepair(context,capture,now());
  return {kind:'offline-editorial-repair-report',liveApproval:false,runId:context.binding.runId,
    contextSha256:editorialRepairSha256(context),captureSha256:editorialRepairSha256(capture),planSha256:editorialRepairSha256(plan),
    proposalSha256:sha256(JSON.stringify(plan.proposal)+'\n'),selected:10,repaired:8,expectedVisibleOriginalArticles:42,
    expectedIndexablePages:42,cutoff:context.binding.cutoff,notAfter:context.binding.notAfter};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help')console.log('OFFLINE READ-ONLY planner: --context PRIVATE.json --context-sha256 SHA --capture PRIVATE.json --capture-sha256 SHA\nRequires actual same-run captured rows/grants, not synthetic production substitutes. Refuses elapsed original cutoff. No live mode or approval is implied.');
  else reviewEditorialRecoveryFiles(args).then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Offline editorial plan refused; verify private inputs, hashes, bindings and original cutoff. No live action attempted.');process.exitCode=1;});
}
