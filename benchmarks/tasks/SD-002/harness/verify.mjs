#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
for(const p of ['test/filter.test.js','package.json']){
  const a=await readFile(join(taskDir,'fixture',p)); const b=await readFile(join(ws,p));
  if(!a.equals(b)) fail('protected '+p);
}
const code=await readFile(join(ws,'src/filter.js'),'utf8');
if(!/filterTodos/.test(code)||/TODO: implement/.test(code)) fail('filter not implemented');
const { filterTodos } = await import(pathToFileURL(join(ws,'src/filter.js')).href);
if(filterTodos('', 'home').length!==2) fail('filter empty query home');
if(filterTodos('milk', 'home').length!==1) fail('filter milk');
if(filterTodos('', 'work').length!==1) fail('filter work tag');
if(filterTodos('call', 'home').length!==1) fail('filter combined');
console.log('DWB_VERIFY_PASS');
