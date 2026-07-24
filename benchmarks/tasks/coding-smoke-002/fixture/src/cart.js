export function subtotal(items) {
  return items.reduce((total, item) => total + item.price, 0);
}
