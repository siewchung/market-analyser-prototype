import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../../src/domain/config';
import {
  checkDuplicates,
  checkGaps,
  checkInvalidPrices,
  checkInvalidVolumes,
  checkNoRangeZeroVolume,
  checkOutliers,
  checkOutOfOrder,
  runChecks,
} from '../../../../src/domain/quality/checks';
import { bar } from '../../../helpers';

const config = DEFAULT_CONFIG;
const kinds = (issues: readonly { kind: string }[]): string[] => issues.map((i) => i.kind);

describe('checkDuplicates', () => {
  it('separates exact copies from conflicting rows for the same contract and time', () => {
    const first = bar({ at: '2025-11-03T09:30' });
    const copy = { ...first, sourceRow: 900 };
    const conflict = { ...first, close: 105, sourceRow: 901 };
    const issues = checkDuplicates([first, copy, conflict], config);
    expect(issues).toEqual([
      { kind: 'duplicate_exact', contract: 'ESZ25', timestamp: first.timestamp, sourceRows: [first.sourceRow, 900] },
      { kind: 'duplicate_conflict', contract: 'ESZ25', timestamp: first.timestamp, sourceRows: [first.sourceRow, 901] },
    ]);
  });

  it('does not treat the same time on different contracts as a duplicate', () => {
    expect(checkDuplicates([bar({ contract: 'ESZ25' }), bar({ contract: 'NQZ25' })], config)).toEqual([]);
  });
});

describe('checkInvalidPrices', () => {
  it.each([
    [{ open: 0 }, 'non_positive'],
    [{ low: -1 }, 'non_positive'],
    [{ high: 98, low: 99 }, 'high_below_low'],
    [{ open: 102 }, 'open_outside_range'],
    [{ close: 98 }, 'close_outside_range'],
  ] as const)('flags %o as %s', (overrides, reason) => {
    const issues = checkInvalidPrices([bar(overrides)], config);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'invalid_price', reason });
  });

  it('accepts a valid bar, including one with no price range', () => {
    expect(checkInvalidPrices([bar(), bar({ open: 100, high: 100, low: 100, close: 100 })], config)).toEqual([]);
  });
});

describe('checkInvalidVolumes', () => {
  it('flags missing, negative and fractional volume but accepts zero', () => {
    const issues = checkInvalidVolumes([bar({ volume: null }), bar({ volume: -1 }), bar({ volume: 1.5 }), bar({ volume: 0 })], config);
    expect(issues.map((i) => (i.kind === 'invalid_volume' ? i.reason : ''))).toEqual(['missing', 'negative', 'non_integer']);
  });
});

describe('checkOutOfOrder', () => {
  it('flags a row whose time goes backwards compared with earlier rows of the same contract', () => {
    const rows = [bar({ at: '2025-11-03T09:30' }), bar({ at: '2025-11-03T09:35' }), bar({ at: '2025-11-03T09:32' })];
    const issues = checkOutOfOrder(rows, config);
    expect(issues).toEqual([{ kind: 'out_of_order', contract: 'ESZ25', timestamp: rows[2]?.timestamp, sourceRows: [rows[2]?.sourceRow] }]);
  });

  it('ignores interleaved contracts that are each in order', () => {
    const rows = [bar({ at: '2025-11-03T09:31' }), bar({ contract: 'CLZ25', at: '2025-11-03T09:30' })];
    expect(checkOutOfOrder(rows, config)).toEqual([]);
  });
});

describe('checkGaps (intraday)', () => {
  it('flags a gap longer than the threshold and reports open-market minutes', () => {
    const issues = checkGaps([bar({ at: '2025-11-03T09:30' }), bar({ at: '2025-11-03T09:31' }), bar({ at: '2025-11-03T09:40' })], config);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'gap', gapMinutes: 9 });
  });

  it('does not flag a gap at exactly the threshold', () => {
    expect(checkGaps([bar({ at: '2025-11-03T09:30' }), bar({ at: '2025-11-03T09:35' })], config)).toEqual([]);
  });

  it('ignores the daily maintenance break and the weekend', () => {
    const rows = [
      bar({ at: '2025-11-03T15:59' }),
      bar({ at: '2025-11-03T17:00' }), // across Monday's break
      bar({ at: '2025-11-03T17:01' }),
      bar({ at: '2025-11-07T15:59' }), // (big Tuesday-Friday gap is genuinely flagged)
      bar({ at: '2025-11-09T17:00' }), // across the weekend
    ];
    const issues = checkGaps(rows, config);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.timestamp).toBe(rows[3]?.timestamp);
  });

  it('works on unsorted input', () => {
    const issues = checkGaps([bar({ at: '2025-11-03T09:40' }), bar({ at: '2025-11-03T09:30' })], config);
    expect(issues).toHaveLength(1);
  });
});

describe('checkGaps (daily data)', () => {
  const day = (date: string) => bar({ at: `${date}T00:00` });

  it('flags missing weekdays but not weekends', () => {
    // Fri 7th -> Mon 10th is fine; Mon 10th -> Thu 13th is missing Tue and Wed.
    const issues = checkGaps([day('2025-11-06'), day('2025-11-07'), day('2025-11-10'), day('2025-11-13')], config);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'gap', gapMinutes: 2 * 24 * 60 });
  });
});

describe('checkOutliers', () => {
  // A calm series that ticks up and down, with one big jump in the middle.
  const series = (closes: number[]) =>
    closes.map((close, i) => bar({ at: `2025-11-03T10:${String(i).padStart(2, '0')}`, open: close, high: close, low: close, close }));

  it('flags a price jump far outside the usual move', () => {
    const issues = checkOutliers(series([100, 100.1, 100, 100.1, 100.2, 100.1, 110, 100.1, 100.2, 100.1, 100.2]), config);
    expect(kinds(issues)).toEqual(['outlier', 'outlier']); // the jump up and the drop back
  });

  it('does not flag anything in a calm series', () => {
    expect(checkOutliers(series([100, 100.1, 100, 100.1, 100.2, 100.1, 100.2, 100.1]), config)).toEqual([]);
  });

  it('skips contracts with too few price moves to judge (e.g. mostly flat settlement prices)', () => {
    expect(checkOutliers(series([100, 100, 100, 100, 150, 150, 150]), config)).toEqual([]);
  });

  it('ignores bars with invalid prices', () => {
    const rows = series([100, 100.1, 100, 100.1, 100.2, 100.1, 100.2, 100.1]);
    expect(checkOutliers([...rows, bar({ at: '2025-11-03T10:30', open: -5, close: -5 })], config)).toEqual([]);
  });
});

describe('checkNoRangeZeroVolume', () => {
  it('flags flat bars with zero volume only', () => {
    const flat = { open: 100, high: 100, low: 100, close: 100 };
    const issues = checkNoRangeZeroVolume([bar({ ...flat, volume: 0 }), bar({ ...flat, volume: 5 }), bar({ volume: 0 })], config);
    expect(issues).toHaveLength(1);
  });
});

describe('runChecks', () => {
  it('returns nothing for clean data and runs every check', () => {
    expect(runChecks([bar({ at: '2025-11-03T09:30' }), bar({ at: '2025-11-03T09:31' })], config)).toEqual([]);
    expect(runChecks([], config)).toEqual([]);
  });
});
