#!/usr/bin/env node
import{readFile,writeFile,mkdir}from'node:fs/promises';import{dirname}from'node:path';
const a=process.argv;const g=f=>{const i=a.indexOf(f);return i>=0?a[i+1]:null};
const o=JSON.parse(await readFile(g('--in'),'utf8'));const flat={};
(function w(x,p){for(const[k,v]of Object.entries(x)){const key=p?p+'.'+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))w(v,key);else flat[key]=v}})(o,'');
const h=Object.keys(flat);await mkdir(dirname(g('--out')),{recursive:true});
await writeFile(g('--out'),h.join(',')+''+h.map(k=>flat[k]).join(',')+'');
