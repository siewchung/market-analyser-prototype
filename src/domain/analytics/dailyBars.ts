import type { Bar, DailyBar } from '../types';

/**
 * Rolls intraday bars up into one OHLCV bar per contract per trading day.
 * Expects cleaned bars (sorted by contract then time), so the first bar of a day gives the open and the last gives the close.
 * Missing volume counts as zero in the daily total.
 */
export function dailyBars(bars: readonly Bar[]): DailyBar[] {
  const days = new Map<string, DailyBar>();
  for (const b of bars) {
    const key = `${b.contract}|${b.tradingDate}`;
    const day = days.get(key);
    days.set(
      key,
      day
        ? {
            ...day,
            high: Math.max(day.high, b.high),
            low: Math.min(day.low, b.low),
            close: b.close,
            volume: day.volume + (b.volume ?? 0),
            barCount: day.barCount + 1,
          }
        : { contract: b.contract, tradingDate: b.tradingDate, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0, barCount: 1 },
    );
  }
  return [...days.values()].sort((a, b) => a.contract.localeCompare(b.contract) || a.tradingDate.localeCompare(b.tradingDate));
}
