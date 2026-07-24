import { strict as assert } from 'node:assert';
import { normalizeTags } from './src/tags.js';

const input = ['  Beta', 'alpha', '', 'ALPHA', 42, 'beta ', 'Gamma'];
assert.deepEqual(normalizeTags(input), ['alpha', 'beta', 'gamma']);
assert.deepEqual(input, ['  Beta', 'alpha', '', 'ALPHA', 42, 'beta ', 'Gamma']);
assert.deepEqual(normalizeTags([]), []);
console.log('verified');
