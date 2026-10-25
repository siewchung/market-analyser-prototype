import { describe, expect, it } from 'vitest';
import { dailyBars } from '../../../../src/domain/analytics/dailyBars';
import { downsample } from '../../../../src/domain/analytics/downsample';
import { matchesFilter } from '../../../../src/domain/analytics/filter';
import { rollingVwap } from '../../../../src/domain/analytics/vwap';
import { bar } from '../../../helpers';

describe('dailyBars', () => {
  it('rolls minute bars into one OHLCV bar per contract and trading day', () => {
    const result = dailyBars([
      bar({ at: '2025-11-03T09:30', open: 100, high: 102, low: 99, close: 101, volume: 10 }),
      bar({ at: '2025-11-03T09:31', open: 101, high: 105, low: 100, close: 104, volume: 5 }),
      bar({ at: '2025-11-03T09:32', open: 104, high: 104, low: 97, close: 98, volume: null }),
      bar({ at: '2025-11-04T09:30', open: 98, high: 99, low: 98, close: 99, volume: 7 }),
      bar({ contract: 'CLZ25', at: '2025-11-03T09:30', open: 60, high: 61, low: 59, close: 60.5, volume: 3 }),
    ]);
    expect(result).toEqual([
      { contract: 'CLZ25', tradingDate: '2025-11-03', open: 60, high: 61, low: 59, close: 60.5, volume: 3, barCount: 1 },
      { contract: 'ESZ25', tradingDate: '2025-11-03', open: 100, high: 105, low: 97, close: 98, volume: 15, barCount: 3 },
      { contract: 'ESZ25', tradingDate: '2025-11-04', open: 98, high: 99, low: 98, close: 99, volume: 7, barCount: 1 },
    ]);
  });

  it('groups by the trading date, not the calendar date of the timestamp', () => {
    // A Sunday-evening bar that belongs to Monday's trading session.
    const result = dailyBars([bar({ at: '2025-11-02T18:00', tradingDate: '2025-11-03' }), bar({ at: '2025-11-03T09:30' })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.barCount).toBe(2);
  });

  it('returns nothing for no input', () => {
    expect(dailyBars([])).toEqual([]);
  });
});

describe('rollingVwap', () => {
  // Typical price = (high + low + close) / 3. Using flat bars makes it equal to the close.
  const flat = (at: string, price: number, volume: number | null, contract = 'ESZ25') =>
    bar({ contract, at, open: price, high: price, low: price, close: price, volume });

  it('volume-weights the typical price over the last 15 minutes, including the current bar', () => {
    const result = rollingVwap([flat('2025-11-03T09:30', 100, 10), flat('2025-11-03T09:31', 110, 30)], 15);
    expect(result.map((p) => p.vwap)).toEqual([100, 107.5]); // (100*10 + 110*30) / 40
  });

  it('drops bars that are 15 or more minutes old from the window', () => {
    const result = rollingVwap([flat('2025-11-03T09:30', 100, 10), flat('2025-11-03T09:45', 200, 10)], 15);
    expect(result[1]?.vwap).toBe(200);
  });

  it('uses the typical price, not just the close', () => {
    const [point] = rollingVwap([bar({ open: 100, high: 103, low: 97, close: 102, volume: 1 })], 15);
    expect(point?.vwap).toBeCloseTo((103 + 97 + 102) / 3);
  });

  it('returns null instead of dividing by zero when nothing traded in the window', () => {
    const result = rollingVwap([flat('2025-11-03T09:30', 100, 0), flat('2025-11-03T09:31', 100, null)], 15);
    expect(result.map((p) => p.vwap)).toEqual([null, null]);
  });

  it('keeps each contract separate', () => {
    const result = rollingVwap([flat('2025-11-03T09:30', 100, 10), flat('2025-11-03T09:31', 50, 10, 'CLZ25')], 15);
    expect(result.map((p) => [p.contract, p.vwap])).toEqual([['ESZ25', 100], ['CLZ25', 50]]);
  });
});

describe('matchesFilter', () => {
  it('matches everything with an empty filter', () => {
    expect(matchesFilter({ contracts: [] }, 'ESZ25', '2025-11-03')).toBe(true);
  });

  it('filters by contract and an inclusive date range', () => {
    const filter = { contracts: ['ESZ25'], from: '2025-11-03', to: '2025-11-04' };
    expect(matchesFilter(filter, 'ESZ25', '2025-11-03')).toBe(true);
    expect(matchesFilter(filter, 'ESZ25', '2025-11-04')).toBe(true);
    expect(matchesFilter(filter, 'ESZ25', '2025-11-05')).toBe(false);
    expect(matchesFilter(filter, 'CLZ25', '2025-11-03')).toBe(false);
  });
});

describe('downsample', () => {
  it('returns the input unchanged when it is already small enough', () => {
    expect(downsample([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('keeps at most the limit, including the first and last points', () => {
    const result = downsample(Array.from({ length: 1000 }, (_, i) => i), 10);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result[0]).toBe(0);
    expect(result.at(-1)).toBe(999);
  });
});

