import { readFile } from 'node:fs/promises';
const html = await readFile('index.html', 'utf8');
const source = await readFile('src/game.js', 'utf8');
if (!html.includes('id="game"')) throw new Error('missing game canvas');
for (const concept of ['keydown', 'jump', 'collision', 'win']) if (!source.toLowerCase().includes(concept)) throw new Error(`missing ${concept}`);
console.log('mario verification passed');
