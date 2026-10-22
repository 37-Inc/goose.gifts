import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inventoryPublicationPackage } from '../scripts/catalog/publish-release.ts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function directory(t){
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'publication-package-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;
}

test('real package inventories retain hashes above10k, accept20,000 actual files, and reject20,001',async t=>{
  const root=await directory(t),suffixes=['.html','.txt','.json','.js','.png'];
  const name=i=>`assets/group-${Math.floor(i/200)}/file-${i}${suffixes[i%suffixes.length]}`;
  const body=i=>Buffer.from([0,255,...Buffer.from(`Synthetic package file ${i}`)]);
  async function add(start,end){
    for(let i=start;i<end;i+=64)await Promise.all(Array.from({length:Math.min(64,end-i)},async(_,offset)=>{
      const n=i+offset,file=path.join(root,name(n));await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
      await fs.writeFile(file,body(n),{mode:0o600});
    }));
  }
  await add(0,15422);
  const realistic=await inventoryPublicationPackage(root);assert.equal(Object.keys(realistic).length,15422);
  for(const i of [0,7711,15421])assert.equal(realistic[name(i)],sha(body(i)));
  await add(15422,20000);
  const boundary=await inventoryPublicationPackage(root);assert.equal(Object.keys(boundary).length,20000);
  assert.equal(boundary[name(19999)],sha(body(19999)));assert.equal(boundary[name(0)],realistic[name(0)]);
  await add(20000,20001);await assert.rejects(inventoryPublicationPackage(root),/publication_package_bound/);
});

test('larger file count allowance preserves private modes, symlink refusal, binary hashes and128MiB total bound',async t=>{
  const root=await directory(t),file=path.join(root,'binary.png'),body=Buffer.from([0,255,128,13,10]);
  await fs.writeFile(file,body,{mode:0o600});assert.equal((await inventoryPublicationPackage(root))['binary.png'],sha(body));
  await fs.chmod(file,0o644);await assert.rejects(inventoryPublicationPackage(root),/publication_package_invalid/);
  await fs.chmod(file,0o600);await fs.chmod(root,0o755);
  await assert.rejects(inventoryPublicationPackage(root),/publication_package_invalid/);await fs.chmod(root,0o700);
  const link=path.join(root,'linked.png');await fs.symlink(file,link);
  await assert.rejects(inventoryPublicationPackage(root),/publication_package_invalid/);await fs.unlink(link);await fs.unlink(file);
  const chunk=Buffer.alloc(32*1024*1024);
  for(let i=0;i<4;i++)await fs.writeFile(path.join(root,`${i}.bin`),chunk,{mode:0o600});
  await fs.writeFile(path.join(root,'overflow.bin'),Buffer.from([1]),{mode:0o600});
  await assert.rejects(inventoryPublicationPackage(root),/publication_package_bound/);
});
