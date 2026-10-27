import type { Bar } from '../types';
import { invalidPriceReason } from './checks';

/**
 * Produces the dataset used for analytics. The quality report still shows every problem found;
 * this only decides what the charts and daily bars are built from.
 * - Bars with impossible prices are removed.
 * - Duplicates: the first row in the file wins.
 *   With `keepErrorBars`, impossible prices and conflicting duplicates (same time, different values) are kept,
 *   so users can see what the error bars would do to the numbers. Exact copies are still dropped.
 * - Negative volume is blanked (set to null) so it can't distort VWAP; the price data is still used.
 * - The result is sorted by contract, then time.
 * The input array is not modified.
 */
export function clean(bars: readonly Bar[], options: { readonly keepErrorBars?: boolean } = {}): Bar[] {
  const seen = new Set<string>();
  // Two bars count as the same if they share contract and time; when keeping error bars, their values must match too.
  const keyOf = (b: Bar): string =>
    options.keepErrorBars ? `${b.contract}|${b.timestamp}|${b.open}|${b.high}|${b.low}|${b.close}|${b.volume}` : `${b.contract}|${b.timestamp}`;
  return bars
    .filter((b) => options.keepErrorBars || invalidPriceReason(b) === null)
    .filter((b) => {
      const key = keyOf(b);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((b) => (b.volume !== null && b.volume < 0 ? { ...b, volume: null } : b))
    .sort((a, b) => a.contract.localeCompare(b.contract) || a.timestamp - b.timestamp);
}
