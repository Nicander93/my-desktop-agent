import { itemUnitPrice } from './discount.js';
import { multiply, roundMoney } from './money.js';

/** BUG: bulk quantity discount never applied */
export function calculateLineTotal(line) {
  const unit = itemUnitPrice(line.sku, line.unitPrice);
  const subtotal = multiply(unit, line.quantity);
  return roundMoney(subtotal);
}

export function sumLines(lines) {
  return roundMoney(lines.reduce((acc, line) => acc + calculateLineTotal(line), 0));
}
