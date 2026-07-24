import test from 'node:test';
import assert from 'node:assert/strict';
import { filterVisible } from '../src/filter.js';

const items = [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Almanac' }];

test('matches the query anywhere in the item name', () => {
  assert.deepEqual(filterVisible(items, 'man'), [{ name: 'Almanac' }]);
});

test('is case insensitive and preserves all items for empty queries', () => {
  assert.deepEqual(filterVisible(items, 'ALP'), [{ name: 'Alpha' }]);
  assert.equal(filterVisible(items, '  '), items);
});
