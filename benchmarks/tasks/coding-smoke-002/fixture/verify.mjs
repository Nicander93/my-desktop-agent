import { strict as assert } from 'node:assert';
import { subtotal } from './src/cart.js';

assert.equal(subtotal([{ price: 10, quantity: 2 }, { price: 5 }]), 25);
assert.equal(subtotal([]), 0);
console.log('verified');
