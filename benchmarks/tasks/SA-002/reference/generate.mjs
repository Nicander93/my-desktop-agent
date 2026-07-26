#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
await readFile(join(root, 'input/logs/app.log'), 'utf8');

const report = `# Incident Report — 2024-06-18

## Facts
- Deploy v2.4.1 completed at 14:20:03Z (E001).
- HTTP 503 on /api/orders at 14:32:02Z (E002).
- Database connection pool exhausted at 14:32:05Z (E003).
- Access log 503 at 14:32:03Z (E005).

## Inferences
- Connection leak after deploy likely caused pool exhaustion (based on E003, E004).
- User-facing outage began ~14:32Z (based on E002, E005).

## Verification steps
1. Confirm conn-88 release path in v2.4.1 diff.
2. Re-run load test after patch; pool idle count should stay >0.
`;

const timeline = `timestamp,source,event_type,description,evidence_id
2024-06-18T14:20:03Z,app,deploy,deploy complete version=2.4.1,E001
2024-06-18T14:32:02Z,app,error,HTTP 503 /api/orders,E002
2024-06-18T14:32:03Z,access,error,access 503 /api/orders,E005
2024-06-18T14:32:05Z,app,error,db pool exhausted,E003
2024-06-18T14:33:20Z,app,warn,leak-suspect conn-88 not released,E004
`;

const evidence = {
  facts: [
    { statement: 'deploy complete version=2.4.1', evidence_id: 'E001' },
    { statement: 'db pool exhausted', evidence_id: 'E003' },
  ],
  inferences: [
    { statement: 'connection leak after deploy caused outage', based_on: ['E003', 'E004'] },
  ],
  evidence: {
    E001: { file: 'input/logs/app.log', line: 'deploy complete version=2.4.1' },
    E002: { file: 'input/logs/app.log', line: 'HTTP 503 /api/orders' },
    E003: { file: 'input/logs/app.log', line: 'db pool exhausted' },
    E004: { file: 'input/logs/app.log', line: 'leak-suspect ConnectionHandler' },
    E005: { file: 'input/logs/access.log', line: 'access 503' },
  },
};

await mkdir(join(root, 'output'), { recursive: true });
await writeFile(join(root, 'output/incident-report.md'), report);
await writeFile(join(root, 'output/timeline.csv'), timeline);
await writeFile(join(root, 'output/evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log('SA-002 reference outputs written');
