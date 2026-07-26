import discounts from '../config/discounts.json' with { type: 'json' };

export function itemUnitPrice(sku, basePrice) {
  const rate = discounts.itemDiscounts[sku] ?? 1;
  return basePrice * rate;
}

export function bulkThreshold() {
  return discounts.bulkThreshold;
}

export function bulkRate() {
  return discounts.bulkRate;
}
