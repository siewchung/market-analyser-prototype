import type { Bar } from './types';

/** Groups bars by contract, keeping the original order within each group. */
export function groupByContract(bars: readonly Bar[]): Map<string, Bar[]> {
  const groups = new Map<string, Bar[]>();
  for (const b of bars) {
    const group = groups.get(b.contract);
    if (group) group.push(b);
    else groups.set(b.contract, [b]);
  }
  return groups;
}

/** Never show more decimals than this, whatever the data contains. */
const MAX_PRICE_DECIMALS = 6;

/** How many decimal places a number was written with, e.g. 60.25 -> 2, 5000 -> 0. */
function decimalPlaces(value: number): number {
  const text = value.toString();
  if (text.includes('e')) return MAX_PRICE_DECIMALS; // very small or large numbers in scientific notation
  return text.split('.')[1]?.length ?? 0;
}

/**
 * The number of decimal places to show prices with, per contract, based on the most precise price in the data.
 * This lets every price for a contract line up with the same decimals (61.00 next to 61.25, not 61 next to 61.25).
 */
export function priceDecimals(bars: readonly Bar[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const b of bars) {
    const places = Math.max(decimalPlaces(b.open), decimalPlaces(b.high), decimalPlaces(b.low), decimalPlaces(b.close));
    result[b.contract] = Math.min(MAX_PRICE_DECIMALS, Math.max(result[b.contract] ?? 0, places));
  }
  return result;
}
