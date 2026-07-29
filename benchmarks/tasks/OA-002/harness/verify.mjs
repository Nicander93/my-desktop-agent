#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipXmlText } from '../../../lib/officeZipText.mjs';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};

function listZipEntries(buf){
  const names=[];
  for(let i=0;i<buf.length-4;i++){
    if(buf.readUInt32LE(i)===0x02014b50){
      const nlen=buf.readUInt16LE(i+28);
      names.push(buf.subarray(i+46,i+46+nlen).toString('utf8'));
    }
  }
  return names;
}

const pptx=await readFile(join(ws,'output/presentation.pptx'));
const entries=listZipEntries(pptx);
const slides=entries.filter((n) => n.startsWith('ppt/slides/slide') && n.endsWith('.xml'));
if(slides.length<8||slides.length>12) fail('slide count '+slides.length);
const all=zipXmlText(pptx);
for(const s of ['Executive Summary','Metrics','Risks','Next Steps','1200000','540']) if(!all.includes(s)) fail('missing '+s);
const outline=await readFile(join(ws,'output/outline.md'),'utf8');
if(outline.split('\n').filter(Boolean).length<8) fail('outline too short');
const briefA=await readFile(join(taskDir,'fixture/input/brief.json'));
const briefB=await readFile(join(ws,'input/brief.json'));
if(!briefA.equals(briefB)) fail('brief modified');
console.log('DWB_VERIFY_PASS');
