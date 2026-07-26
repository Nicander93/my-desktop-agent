#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ws=process.cwd(); const taskDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{console.error('DWB_VERIFY_FAIL: '+m);process.exit(1);};
function parseCsv(t){const lines=t.trim().split('\n');const h=lines[0].split(',');return lines.slice(1).filter(Boolean).map(l=>{const c=l.split(',');const o={};h.forEach((x,i)=>o[x]=c[i]);return o;});}
const expenses=parseCsv(await readFile(join(ws,'input/expenses.csv'),'utf8'));
const policy=JSON.parse(await readFile(join(ws,'input/policy.json'),'utf8'));
const expected=[];
const receipts=new Map();
let total=0;
for(const e of expenses){
  total+=Number(e.amount);
  if(e.category==='meals'&&Number(e.amount)>policy.mealLimit) expected.push({expense_id:e.expense_id,rule:'meal_limit'});
  if(Number(e.amount)>policy.receiptRequiredAbove&&!e.receipt_id) expected.push({expense_id:e.expense_id,rule:'missing_receipt'});
  if(e.receipt_id){
    if(receipts.has(e.receipt_id)) expected.push({expense_id:e.expense_id,rule:'duplicate_receipt'});
    receipts.set(e.receipt_id,e.expense_id);
  }
}
const ex=parseCsv(await readFile(join(ws,'exceptions.csv'),'utf8'));
if(ex.length!==expected.length) fail('exception count '+ex.length+' vs '+expected.length);
for(const exp of expected){
  if(!ex.find(x=>x.expense_id===exp.expense_id&&x.rule===exp.rule)) fail('missing exception '+exp.expense_id+' '+exp.rule);
}
const summary=await readFile(join(ws,'summary.md'),'utf8');
if(!summary.includes(String(total))&&!summary.includes('410')) fail('summary missing total amount');
if(!summary.includes(String(expected.length))) fail('summary missing exception count');
for(const p of ['input/expenses.csv','input/policy.json']){
  const a=await readFile(join(taskDir,'fixture',p)); const b=await readFile(join(ws,p));
  if(!a.equals(b)) fail('modified '+p);
}
console.log('DWB_VERIFY_PASS');
