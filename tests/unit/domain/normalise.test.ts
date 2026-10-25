import { describe, expect, it } from 'vitest';
import { MissingColumnsError, normalise } from '../../../src/domain/normalise';
import type { RawRecord } from '../../../src/domain/types';

// Helper: wall-clock ms for a "YYYY-MM-DDTHH:MM" string, using the same convention as the app.
const wall = (iso: string): number => Date.parse(`${iso}:00Z`);

const row = (overrides: Record<string, unknown> = {}): RawRecord => ({
  Contract: 'ESZ25',
  Timestamp: '2025-11-03 09:30:00',
  Open: '5000',
  High: '5002',
  Low: '4999',
  Close: '5001',
  Volume: '100',
  ...overrides,
});

describe('normalise', () => {
  it('converts a clean CSV-style row into a typed Bar', () => {
    const { bars, rejected } = normalise([row()]);
    expect(rejected).toEqual([]);
    expect(bars).toEqual([
      {
        contract: 'ESZ25',
        timestamp: wall('2025-11-03T09:30'),
        tradingDate: '2025-11-03',
        open: 5000,
        high: 5002,
        low: 4999,
        close: 5001,
        volume: 100,
        sourceRow: 1,
      },
    ]);
  });

  it('treats timestamps without a timezone as Chicago wall-clock, not local time', () => {
    const { bars } = normalise([row({ Timestamp: '2025-03-09T02:30:00' })]); // inside the US DST jump
    expect(bars[0]?.timestamp).toBe(wall('2025-03-09T02:30'));
  });

  it('accepts the real Parquet column names and value types (bigint, Date)', () => {
    const parquetRow: RawRecord = {
      contract_symbol: 'ZNH26',
      timestamp_ms: 1751016600000n,
      timestamp_chicago_wall: new Date('2025-06-27T09:30:00Z'),
      trading_date: new Date('2025-06-27T00:00:00Z'),
      open: 112.09375,
      high: 112.09375,
      low: 112.09375,
      close: 112.09375,
      volume: 1n,
    };
    const { bars } = normalise([parquetRow]);
    expect(bars[0]).toMatchObject({
      contract: 'ZNH26',
      timestamp: wall('2025-06-27T09:30'),
      tradingDate: '2025-06-27',
      volume: 1,
    });
  });

  it('assigns evening-session bars to the next trading day, ignoring a calendar-date trading_date column', () => {
    const { bars } = normalise([
      row({ Timestamp: '2025-11-03 16:59:00' }),
      row({ Timestamp: '2025-11-03 17:00:00', trading_date: '2025-11-03' }),
      row({ Timestamp: '2025-11-02 18:00:00' }), // Sunday evening opens Monday's session
    ]);
    expect(bars.map((b) => b.tradingDate)).toEqual(['2025-11-03', '2025-11-04', '2025-11-03']);
  });

  it('falls back to epoch milliseconds when there is no wall-clock column', () => {
    const { bars } = normalise([{ symbol: 'GCZ25', timestamp_ms: '1762162200000', o: 1, h: 2, l: 1, c: 2, v: 3 }]);
    expect(bars[0]).toMatchObject({ contract: 'GCZ25', timestamp: 1762162200000, open: 1, close: 2, volume: 3 });
  });

  it('keeps missing volume as null so it can be flagged later', () => {
    const { bars } = normalise([row({ Volume: '' })]);
    expect(bars[0]?.volume).toBeNull();
  });

  it('keeps negative and fractional volume so the quality checks can flag them', () => {
    const { bars } = normalise([row({ Volume: '-10' }), row({ Volume: '12.5' })]);
    expect(bars.map((b) => b.volume)).toEqual([-10, 12.5]);
  });

  it.each([
    [{ Contract: '  ' }, 'missing_contract'],
    [{ Timestamp: 'not-a-date' }, 'bad_timestamp'],
    [{ Timestamp: undefined }, 'bad_timestamp'],
    [{ Open: '' }, 'missing_price'],
    [{ Close: undefined }, 'missing_price'],
    [{ High: 'abc' }, 'non_numeric_price'],
  ] as const)('rejects a malformed row %o with reason %s', (overrides, reason) => {
    const { bars, rejected } = normalise([row(), row(overrides)]);
    expect(bars).toHaveLength(1);
    expect(rejected).toEqual([{ sourceRow: 2, reason, raw: row(overrides) }]);
  });

  it('throws a clear error when required columns cannot be found', () => {
    expect(() => normalise([{ Contract: 'ESZ25', Price: 1 }])).toThrow(MissingColumnsError);
    expect(() => normalise([{ Contract: 'ESZ25', Price: 1 }])).toThrow(/timestamp, open, high, low, close/);
  });

  it('numbers rows from the given first row number, so CSV rows match Excel line numbers', () => {
    const { bars, rejected } = normalise([row(), row({ Open: '' })], undefined, 2);
    expect(bars[0]?.sourceRow).toBe(2);
    expect(rejected[0]?.sourceRow).toBe(3);
  });

  it('returns empty results for an empty file instead of throwing', () => {
    expect(normalise([])).toEqual({ bars: [], rejected: [] });
  });
});
