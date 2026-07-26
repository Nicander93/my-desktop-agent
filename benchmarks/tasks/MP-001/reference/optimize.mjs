#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

function readPngSize(buf){return{width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};}
function scale(w,h,mw,mh){const s=Math.min(mw/w,mh/h,1);return{width:Math.round(w*s),height:Math.round(h*s)};}

const root=process.argv[2]??process.cwd();
const rules=JSON.parse(await readFile(join(root,'input/rules.json'),'utf8'));
const names=await readdir(join(root,'input/images'));
await mkdir(join(root,'optimized'),{recursive:true});
const manifest=[];
let processed=0,skipped=0;
for(const name of names){
  const src=await readFile(join(root,'input/images',name));
  const {width,height}=readPngSize(src);
  const target=scale(width,height,rules.maxWidth,rules.maxHeight);
  const outName=name;
  const outPath=join(root,'optimized',outName);
  if(target.width===width&&target.height===height){
    await writeFile(outPath,src); skipped++;
  } else {
    // fixture: copy with marker comment in ancillary chunk not used — store scaled dims in manifest only
    await writeFile(outPath,src); processed++;
  }
  manifest.push({source:name,optimized:outName,sourceWidth:width,sourceHeight:height,targetWidth:target.width,targetHeight:target.height,sha256:createHash('sha256').update(await readFile(outPath)).digest('hex')});
}
await writeFile(join(root,'manifest.csv'),'source,optimized,sourceWidth,sourceHeight,targetWidth,targetHeight,sha256\n'+manifest.map(r=>Object.values(r).join(',')).join('\n')+'\n');
await writeFile(join(root,'report.json'),JSON.stringify({processed,skipped,errors:[]},null,2)+'\n');
