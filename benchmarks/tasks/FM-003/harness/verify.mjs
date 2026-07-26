#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
async function walk(dir, base=''){const out=[];for(const n of await readdir(dir)){const p=join(dir,n);const rel=base?base+'/'+n:n;const st=await stat(p);if(st.isDirectory())out.push(...await walk(p,rel));else out.push({rel,p,size:st.size});}return out;}
const srcFiles=await walk(join(ws,'source'));
const manifest=JSON.parse(await readFile(join(ws,'manifest.json'),'utf8'));
const ver=JSON.parse(await readFile(join(ws,'verification.json'),'utf8'));
if(manifest.fileCount!==srcFiles.length||ver.fileCount!==srcFiles.length) fail('fileCount');
if(!ver.passed||ver.mismatches.length) fail('verification failed');
for(const f of srcFiles){
  const data=await readFile(f.p); const hash=createHash('sha256').update(data).digest('hex');
  const m=manifest.files.find(x=>x.path===f.rel);
  if(!m||m.sha256!==hash||m.size!==f.size) fail('manifest mismatch '+f.rel);
  const bak=await readFile(join(ws,'backup',f.rel));
  if(!data.equals(bak)) fail('backup content '+f.rel);
}
for(const f of srcFiles){
  const a=await readFile(f.p); const b=await readFile(join(taskDir,'fixture/source',f.rel));
  if(!a.equals(b)) fail('source modified '+f.rel);
}
console.log('DWB_VERIFY_PASS');
