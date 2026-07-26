import { itemUnitPrice, bulkThreshold, bulkRate } from './discount.js';
import { multiply, roundMoney } from './money.js';

export function calculateLineTotal(line) {
  const unit = itemUnitPrice(line.sku, line.unitPrice);
  let subtotal = multiply(unit, line.quantity);
  if (line.quantity >= bulkThreshold()) {
    subtotal = roundMoney(subtotal * bulkRate());
  }
  return roundMoney(subtotal);
}

export function sumLines(lines) {
  return roundMoney(lines.reduce((acc, line) => acc + calculateLineTotal(line), 0));
}
