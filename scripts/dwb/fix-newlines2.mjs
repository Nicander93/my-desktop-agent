import { readFile, writeFile } from 'node:fs/promises';

const p = 'scripts/dwb/generate-wave3.mjs';
let s = await readFile(p, 'utf8');

s = s.replace(/await writeText\((join\([^)]+\)), '((?:[^'\\]|\\.)*)'\)/g, (m, jpath, body) => {
  if (!body.includes('\\n')) return m;
  if (jpath.includes('convert.mjs')) return m;
  const inner = body.replace(/\\n/g, '\n');
  return `await writeText(${jpath}, \`${inner.replace(/`/g, '\\`')}\`)`;
});

s = s.replace(/\.join\('\\n'\)/g, ".join('\\n')");

// Fix template literals that still have \\n in markdown outputs (backtick strings)
s = s.replace(/await writeText\((join\([^)]+\)), `([^`]*)`\)/g, (m, jpath, body) => {
  if (!body.includes('\\n')) return m;
  return `await writeText(${jpath}, \`${body.replace(/\\n/g, '\n')}\`)`;
});

await writeFile(p, s);
console.log('done');
