#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const transcript = await readFile(join(root, 'input/transcript.md'), 'utf8');

const minutes = `# Meeting Minutes

## Summary
Sprint planning covered API v1 design. Evidence: [E001] [E003] [E010].

## Decisions
- Ship REST for v1 ([E003]). GraphQL deferred.

## Discussion
Rate limiting approaches discussed without decision ([E007]).

## Open Items
Load test plan owner unassigned ([E008]).
`;

const actions = `action_id,description,owner,due_date,evidence_ids
A1,Review security checklist,Charlie,2024-03-15,E005;E010
A2,Update API documentation,Bob,TBD,E004
`;

await mkdir(join(root, 'output'), { recursive: true });
await writeFile(join(root, 'output/minutes.md'), minutes);
await writeFile(join(root, 'output/actions.csv'), actions);
console.log('KW-002 reference outputs written');
