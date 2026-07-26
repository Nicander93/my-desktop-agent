# ISSUE-42: Bulk quantity discount ignored

## Summary
`calculateLineTotal` applies the base unit price but ignores tiered quantity discounts from `config/discounts.json`.

## Reproduction
Run `pnpm test`. Tests `bulk discount applies at quantity 10` and integration cart scenario fail.

## Expected
When line quantity >= `bulkThreshold` (10), apply `bulkRate` (0.9) to the subtotal after item-level discounts.

## Constraints
- Do not change tests
- Fix in `src/` only
