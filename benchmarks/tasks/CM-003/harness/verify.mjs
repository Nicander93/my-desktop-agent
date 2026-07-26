#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};

const cfg=JSON.parse(await readFile(join(ws,'input/participants.json'),'utf8'));
const opts=JSON.parse(await readFile(join(ws,'meeting-options.json'),'utf8'));
if(!opts.candidates||opts.candidates.length<2) fail('need >=2 candidates');

function parseBusy(){
  const blocks=[];
  for(const p of cfg.participants){
    for(const [s,e] of p.busy){
      blocks.push({start:new Date(s+(s.includes('Z')?'':'Z')).getTime(),end:new Date(e+(e.includes('Z')?'':'Z')).getTime()});
    }
  }
  return blocks;
}
const busy=parseBusy();
const dur=cfg.durationMinutes*60*1000;
for(const c of opts.candidates){
  const st=new Date(c.startUtc).getTime();
  const en=new Date(c.endUtc).getTime();
  if(en-st!==dur) fail('duration mismatch');
  for(const b of busy){if(st<b.end&&en>b.start) fail('conflict '+c.startUtc);}
  const d=new Date(c.startUtc);
  const wd=d.getUTCDay();
  if(cfg.constraints.weekdaysOnly&&(wd===0||wd===6)) fail('weekend slot');
}
const prop=await readFile(join(ws,'proposal.md'),'utf8');
if(prop.trim().length<30) fail('proposal too short');
const a=await readFile(join(taskDir,'fixture/input/participants.json'));
const b=await readFile(join(ws,'input/participants.json'));
if(!a.equals(b)) fail('input modified');
console.log('DWB_VERIFY_PASS');
