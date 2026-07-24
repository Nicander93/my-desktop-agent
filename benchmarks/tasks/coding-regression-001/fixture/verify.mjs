import { strict as assert } from 'node:assert';
import { parseRetryAfter } from './src/retry-after.js';

assert.equal(parseRetryAfter(5), 5);
assert.equal(parseRetryAfter(' 12 '), 12);
for (const value of [undefined, '', 'nope', '3.5', 3.5, 0, -1, Infinity]) assert.equal(parseRetryAfter(value), undefined);
console.log('verified');
