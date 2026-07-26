#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
function parseCsv(t){const lines=t.trim().split('\n');const h=lines[0].split(',');return lines.slice(1).filter(Boolean).map(l=>{const c=l.split(',');const o={};h.forEach((x,i)=>o[x]=c[i]);return o;});}
async function expected(){
  const customers=Object.fromEntries(parseCsv(await readFile(join(taskDir,'fixture/input/customers.csv'),'utf8')).map(r=>[r.customer_id,r]));
  const products=Object.fromEntries(parseCsv(await readFile(join(taskDir,'fixture/input/products.csv'),'utf8')).map(r=>[r.product_id,r]));
  const orders=parseCsv(await readFile(join(taskDir,'fixture/input/orders.csv'),'utf8'));
  let merged=0,unmatched=0,dup=0;const seen=new Set();
  for(const o of orders){if(seen.has(o.order_id)){dup++;continue;}seen.add(o.order_id);if(!customers[o.customer_id]||!products[o.product_id])unmatched++;else merged++;}
  return {merged,unmatched,dup,total:orders.length};
}
const exp=await expected();
const report=JSON.parse(await readFile(join(ws,'output/report.json'),'utf8'));
if(report.totalOrders!==exp.total||report.mergedRows!==exp.merged||report.unmatchedRows!==exp.unmatched||report.duplicateOrdersSkipped!==exp.dup) fail('report mismatch');
const merged=parseCsv(await readFile(join(ws,'output/merged.csv'),'utf8'));
if(merged.length!==exp.merged) fail('merged count');
const unmatched=parseCsv(await readFile(join(ws,'output/unmatched.csv'),'utf8'));
if(unmatched.length!==exp.unmatched) fail('unmatched count');
for(const p of ['input/customers.csv','input/orders.csv','input/products.csv']){
  const a=await readFile(join(taskDir,'fixture',p)); const b=await readFile(join(ws,p));
  if(!a.equals(b)) fail('modified '+p);
}
console.log('DWB_VERIFY_PASS');
