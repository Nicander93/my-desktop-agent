import test from 'node:test'; import assert from 'node:assert/strict'; import { isNewer } from '../src/app.js';
test('newer', () => assert.equal(isNewer('2.0.0','1.0.0'), true));
