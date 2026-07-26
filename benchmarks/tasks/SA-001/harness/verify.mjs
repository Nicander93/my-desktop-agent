#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};

const yml=await readFile(join(ws,'docker-compose.yml'),'utf8');
if(/ports: "8080:80"/.test(yml)) fail('ports still invalid string form');
if(!/interval:\s*10s/.test(yml)) fail('missing healthcheck interval');
if(!/timeout:\s*5s/.test(yml)) fail('missing healthcheck timeout');
if(!/retries:\s*3/.test(yml)) fail('missing healthcheck retries');
for(const svc of ['web','api','db']){
  const re=new RegExp(svc+':[\\s\\S]*?healthcheck:[\\s\\S]*?test:', 'm');
  if(!re.test(yml)) fail('healthcheck missing for '+svc);
}
if(!/condition:\s*service_/.test(yml)) fail('depends_on condition missing');
if(!/db_data:/.test(yml)) fail('db_data volume removed');
const diag=await readFile(join(ws,'diagnosis.md'),'utf8');
if(diag.length<20) fail('diagnosis too short');
const logA=await readFile(join(taskDir,'fixture/logs/error.txt'));
const logB=await readFile(join(ws,'logs/error.txt'));
if(!logA.equals(logB)) fail('logs modified');
console.log('DWB_VERIFY_PASS');
