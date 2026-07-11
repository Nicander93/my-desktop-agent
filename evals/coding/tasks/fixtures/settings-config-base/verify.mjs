import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const settings = JSON.parse(await readFile('./config/settings.json', 'utf8'));
assert.deepEqual(settings, {
  enabled: true,
  maxRetries: 3,
  regions: ['ap-southeast-1', 'eu-west-1'],
});
console.log('verified');
