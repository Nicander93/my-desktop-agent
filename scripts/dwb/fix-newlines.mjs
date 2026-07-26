import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/dwb/generate-wave3.mjs';
let s = await readFile(path, 'utf8');

// Fix writeText single-quoted strings with literal \\n in build* functions only
s = s.replace(/async build(Fixture|Reference|Faults|Hidden)\([\s\S]*?(?=async build|addTask|\nasync function main)/g, (block) =>
  block.replace(/writeText\(([^,]+),\s*'((?:\\.|[^'])*)'\)/g, (_, file, body) => {
    if (!body.includes('\\n')) return `writeText(${file}, '${body}')`;
    const fixed = body.replace(/\\n/g, '\n').replace(/\\`/g, '`');
    return `writeText(${file}, \`${fixed.replace(/`/g, '\\`')}\`)`;
  }),
);

await writeFile(path, s);
console.log('fixed writeText newlines');
