#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
function readPngSize(buf){return{width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};}
function scale(w,h,mw,mh){const s=Math.min(mw/w,mh/h,1);return{width:Math.round(w*s),height:Math.round(h*s)};}
const rules=JSON.parse(await readFile(join(ws,'input/rules.json'),'utf8'));
const names=await readdir(join(ws,'input/images'));
const lines=(await readFile(join(ws,'manifest.csv'),'utf8')).trim().split('\n').slice(1);
if(lines.length!==names.length) fail('manifest rows');
for(const line of lines){
  const [source,,sw,sh,tw,th]=line.split(',');
  const src=await readFile(join(ws,'input/images',source));
  const {width,height}=readPngSize(src);
  if(Number(sw)!==width||Number(sh)!==height) fail('source dims '+source);
  const exp=scale(width,height,rules.maxWidth,rules.maxHeight);
  if(Number(tw)!==exp.width||Number(th)!==exp.height) fail('target dims '+source);
  try{await readFile(join(ws,'optimized',source));}catch{fail('missing optimized '+source);}
}
const report=JSON.parse(await readFile(join(ws,'report.json'),'utf8'));
if(report.errors?.length) fail('errors present');
for(const n of ['input/images/a.png','input/images/b.png','input/rules.json']){
  const a=await readFile(join(taskDir,'fixture',n)); const b=await readFile(join(ws,n));
  if(!a.equals(b)) fail('modified '+n);
}
console.log('DWB_VERIFY_PASS');
