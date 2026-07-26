#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.argv[2] ?? process.cwd();
function parseCsv(t){const lines=t.trim().split('\n');const h=lines[0].split(',');return lines.slice(1).filter(Boolean).map(l=>{const c=l.split(',');const o={};h.forEach((x,i)=>o[x]=c[i]);return o;});}
const customers=Object.fromEntries(parseCsv(await readFile(join(root,'input/customers.csv'),'utf8')).map(r=>[r.customer_id,r]));
const products=Object.fromEntries(parseCsv(await readFile(join(root,'input/products.csv'),'utf8')).map(r=>[r.product_id,r]));
const orders=parseCsv(await readFile(join(root,'input/orders.csv'),'utf8'));
const merged=[];const unmatched=[];let conflicts=0;const seen=new Set();
for(const o of orders){
  if(seen.has(o.order_id)){conflicts++;continue;} seen.add(o.order_id);
  const c=customers[o.customer_id]; const p=products[o.product_id];
  if(!c||!p){unmatched.push({...o,reason:!c&&!p?'missing_customer_and_product':!c?'missing_customer':'missing_product'});continue;}
  merged.push({order_id:o.order_id,customer_id:o.customer_id,customer_name:c.name,product_id:o.product_id,product_name:p.name,amount:o.amount,unit_price:p.unit_price});
}
await mkdir(join(root,'output'),{recursive:true});
const hdr='order_id,customer_id,customer_name,product_id,product_name,amount,unit_price';
await writeFile(join(root,'output/merged.csv'),hdr+'\n'+merged.map(r=>hdr.split(',').map(k=>r[k]).join(',')).join('\n')+'\n');
await writeFile(join(root,'output/unmatched.csv'),'order_id,customer_id,product_id,amount,reason\n'+unmatched.map(r=>`${r.order_id},${r.customer_id},${r.product_id},${r.amount},${r.reason}`).join('\n')+'\n');
await writeFile(join(root,'output/report.json'),JSON.stringify({totalOrders:orders.length,mergedRows:merged.length,unmatchedRows:unmatched.length,duplicateOrdersSkipped:conflicts},null,2)+'\n');
