import { groupByContract } from '../bars';
import { MINUTE_MS } from '../time';
import type { Bar, VwapPoint } from '../types';

/**
 * Rolling volume-weighted average price (VWAP) for each bar, per contract.
 * For each bar we look back over the window (default 15 minutes, current bar included) and compute:
 *   sum(typical price x volume) / sum(volume), where typical price = (high + low + close) / 3.
 * Expects cleaned bars (sorted by time within each contract).
 *
 * Instead of re-adding the whole window for every bar, we keep running totals:
 * add the new bar, subtract bars that have slid out of the window. That keeps it fast on 100k+ rows.
 */
export function rollingVwap(bars: readonly Bar[], windowMinutes: number): VwapPoint[] {
  const windowMs = windowMinutes * MINUTE_MS;
  const points: VwapPoint[] = [];

  for (const series of groupByContract(bars).values()) {
    let windowStart = 0; // index of the oldest bar still inside the window
    let priceVolume = 0;
    let volume = 0;

    series.forEach((current, i) => {
      priceVolume += typicalPrice(current) * (current.volume ?? 0);
      volume += current.volume ?? 0;

      // Slide the window: drop bars that are windowMinutes or more older than the current bar.
      while (windowStart < i) {
        const oldest = series[windowStart];
        if (!oldest || current.timestamp - oldest.timestamp < windowMs) break;
        priceVolume -= typicalPrice(oldest) * (oldest.volume ?? 0);
        volume -= oldest.volume ?? 0;
        windowStart++;
      }

      points.push({
        contract: current.contract,
        timestamp: current.timestamp,
        tradingDate: current.tradingDate,
        close: current.close,
        vwap: volume > 0 ? priceVolume / volume : null,
      });
    });
  }
  return points;
}

const typicalPrice = (b: Bar): number => (b.high + b.low + b.close) / 3;
