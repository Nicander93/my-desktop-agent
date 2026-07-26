import { sumLines } from './pricing.js';
import { roundMoney } from './money.js';

const SHIPPING_FLAT = 5;

export function buildCart(lines) {
  const subtotal = sumLines(lines);
  const total = roundMoney(subtotal + SHIPPING_FLAT);
  return { lines, subtotal, shipping: SHIPPING_FLAT, total };
}
