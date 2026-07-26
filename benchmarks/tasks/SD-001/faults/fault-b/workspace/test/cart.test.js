import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCart } from '../src/cart.js';

test('cart total includes shipping', () => {
  const cart = buildCart([{ sku: 'PLAIN', unitPrice: 20, quantity: 2 }]);
  assert.equal(cart.subtotal, 40);
  assert.equal(cart.total, 45);
});

test('cart preserves line list', () => {
  const lines = [{ sku: 'A', unitPrice: 10, quantity: 1 }];
  const cart = buildCart(lines);
  assert.deepEqual(cart.lines, lines);
});
