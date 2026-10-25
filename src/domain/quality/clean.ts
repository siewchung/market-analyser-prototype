import type { Bar } from '../types';
import { invalidPriceReason } from './checks';

/**
 * Produces the dataset used for analytics. The quality report still shows every problem found;
 * this only decides what the charts and daily bars are built from.
 * - Bars with impossible prices are removed.
 * - Duplicates: the first row in the file wins.
 * - Negative volume is blanked (set to null) so it can't distort VWAP; the price data is still used.
 * - The result is sorted by contract, then time.
 * The input array is not modified.
 */
export function clean(bars: readonly Bar[]): Bar[] {
  const seen = new Set<string>();
  return bars
    .filter((b) => invalidPriceReason(b) === null)
    .filter((b) => {
      const key = `${b.contract}|${b.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((b) => (b.volume !== null && b.volume < 0 ? { ...b, volume: null } : b))
    .sort((a, b) => a.contract.localeCompare(b.contract) || a.timestamp - b.timestamp);
}
