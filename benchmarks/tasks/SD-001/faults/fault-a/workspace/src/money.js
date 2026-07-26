export function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

export function multiply(a, b) {
  return roundMoney(a * b);
}
