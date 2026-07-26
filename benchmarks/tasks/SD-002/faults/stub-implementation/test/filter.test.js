import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTodos } from '../src/filter.js';

test('empty query returns all for tag', () => {
  assert.equal(filterTodos('', 'home').length, 2);
});
test('query matches text case-insensitive', () => {
  const r = filterTodos('milk', 'home');
  assert.equal(r.length, 1);
  assert.equal(r[0].text, 'Buy milk');
});
test('tag work excludes home items', () => {
  assert.equal(filterTodos('', 'work').length, 1);
});
test('combined query and tag', () => {
  assert.equal(filterTodos('call', 'home').length, 1);
});
