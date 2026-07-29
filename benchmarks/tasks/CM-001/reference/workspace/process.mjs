#!/usr/bin/env node
/** Process mailbox.json → triage.csv, attachment-index.csv, summary.md */
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspace = process.cwd();
const input = await readFile(join(workspace, 'input/mailbox.json'), 'utf8');
const mail = JSON.parse(input);
const outDir = join(workspace, 'output');
await mkdir(outDir, { recursive: true });

// Priority mapping from label → priority
function priorityFor(label) {
  const map = { incident: 'P1', finance: 'P2' }; // default P3 for others (promo, etc.)
  return map[label] || 'P3';
}

const triageRows = mail.messages.map(m => ({
  message_id: m.id,
  category: m.labels[0],      // primary label as category
  priority: priorityFor(m.labels[0]),
}));

// Attachment index: only messages with attachments
const attachmentIndex = [];
for (const m of mail.messages) {
  for (const att of m.attachments) {
    attachmentIndex.push({ message_id: m.id, filename: att.name, size: String(att.size) });
  }
}

// Write triage.csv
{
  const lines = ['message_id,category,priority', ...triageRows.map(r => `${r.message_id},${r.category},${r.priority}`)];
  await writeFile(join(outDir, 'triage.csv'), lines.join('\n') + '\n');
}

// Write attachment-index.csv
{
  const lines = ['message_id,filename,size', ...attachmentIndex.map(a => `${a.message_id},${a.filename},${a.size}`)];
  await writeFile(join(outDir, 'attachment-index.csv'), lines.join('\n') + '\n');
}

// summary.md: count per priority (by category label) and total attachments
const counts = {};   // category → priority
for (const r of triageRows) {
  if (!counts[r.category]) counts[r.category] = [];
  counts[r.category].push(r.priority);
}
const p1Count = mail.messages.filter(m => priorityFor(m.labels[0]) === 'P1').length;
const totalAttachments = attachmentIndex.length;

let summary = '';
// Sort categories by priority: P1 first, then others
const cats = Object.entries(counts);
cats.sort((a, b) => {
  const pa = a[1][0], pb = b[1][0];
  if (pa === 'P1' && pb !== 'P1') return -1;
  if (pb === 'P1' && pa !== 'P1') return 1;
  return 0;
});
for (const [cat, prios] of cats) {
  summary += `P${prios[0]}: ${prios.length} ${cat}.`;
  if (cats.indexOf([cat]) < cats.length - 1) summary += '\n';
}
summary += `\nAttachments: ${totalAttachments}.\n`;

await writeFile(join(outDir, 'summary.md'), summary);
console.log('Done.');
