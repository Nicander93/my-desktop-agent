import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCart } from '../src/index.js';

test('integration: mixed cart with bulk widget line', () => {
  const cart = buildCart([
    { sku: 'WIDGET', unitPrice: 100, quantity: 10 },
    { sku: 'PLAIN', unitPrice: 25, quantity: 2 },
  ]);
  assert.equal(cart.subtotal, 905);
  assert.equal(cart.total, 910);
});
