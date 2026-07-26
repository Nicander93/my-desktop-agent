import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLineTotal } from '../src/pricing.js';

test('single item line uses item discount only', () => {
  const total = calculateLineTotal({ sku: 'WIDGET', unitPrice: 100, quantity: 1 });
  assert.equal(total, 95);
});

test('bulk discount applies at quantity 10', () => {
  const total = calculateLineTotal({ sku: 'WIDGET', unitPrice: 100, quantity: 10 });
  // 100 * 0.95 item * 10 qty * 0.9 bulk = 855
  assert.equal(total, 855);
});

test('quantity below threshold skips bulk rate', () => {
  const total = calculateLineTotal({ sku: 'PLAIN', unitPrice: 50, quantity: 9 });
  assert.equal(total, 450);
});
