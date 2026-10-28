import { describe, expect, it } from 'vitest';
import { assessHealth, contractHealth } from '../../../src/domain/health';
import type { IssueKind, LoadSummary, QualityIssue } from '../../../src/domain/types';
import { bar } from '../../helpers';

const noIssues: Record<IssueKind, number> = {
  duplicate_exact: 0, duplicate_conflict: 0, invalid_price: 0, invalid_volume: 0, gap: 0, out_of_order: 0, outlier: 0, no_range_zero_volume: 0,
};

const summary = (overrides: Partial<LoadSummary> & { counts?: Partial<Record<IssueKind, number>> }): LoadSummary => ({
  fileName: 'f.csv', totalRows: 100, acceptedRows: 100, rejectedRows: 0, cleanRows: 100, contracts: ['ESZ25'],
  dateRange: { from: '2025-11-03', to: '2025-11-03' }, byContract: [], priceDecimals: {},
  ...overrides,
  issueCounts: { ...noIssues, ...overrides.counts },
});

describe('assessHealth', () => {
  it('is "good" when there are no errors or warnings (information-only findings are fine)', () => {
    const verdict = assessHealth(summary({ counts: { no_range_zero_volume: 40 } }));
    expect(verdict.level).toBe('good');
    expect(verdict.headline).toMatch(/good to use/i);
  });

  it('is "caveats" when everything is usable but there are warnings', () => {
    const verdict = assessHealth(summary({ counts: { gap: 2347, outlier: 33 } }));
    expect(verdict).toMatchObject({ level: 'caveats', errors: 0, warnings: 2380 });
    expect(verdict.headline).toMatch(/usable with caveats/i);
  });

  it('is "caveats" for a handful of errors in an otherwise usable file', () => {
    expect(assessHealth(summary({ cleanRows: 99, counts: { invalid_price: 1 } })).level).toBe('caveats');
  });

  it('is "poor" when less than 95% of rows are usable', () => {
    const verdict = assessHealth(summary({ totalRows: 27, rejectedRows: 5, cleanRows: 18, counts: { invalid_price: 2, duplicate_conflict: 1 } }));
    expect(verdict).toMatchObject({ level: 'poor', errors: 8 }); // 5 rejected rows + 3 error issues
    expect(verdict.headline).toMatch(/needs attention/i);
    expect(verdict.headline).toMatch(/66\.7%/);
  });

  it('is "poor" for an empty file', () => {
    expect(assessHealth(summary({ totalRows: 0, cleanRows: 0, acceptedRows: 0 })).level).toBe('poor');
  });
});

describe('contractHealth', () => {
  it('counts bars, usable bars and issues by severity for each contract', () => {
    const es = [bar({ contract: 'ESZ25' }), bar({ contract: 'ESZ25' })];
    const cl = [bar({ contract: 'CLZ25' })];
    const issue = (kind: IssueKind, contract: string) => ({ kind, contract, timestamp: 0, sourceRows: [1] }) as QualityIssue;
    const result = contractHealth([...es, ...cl], [es[0]!, ...cl], [issue('invalid_price', 'ESZ25'), issue('gap', 'ESZ25'), issue('no_range_zero_volume', 'CLZ25')]);
    expect(result).toEqual([
      { contract: 'CLZ25', firstDate: '2025-11-03', lastDate: '2025-11-03', bars: 1, usableBars: 1, errors: 0, warnings: 0, info: 1 },
      { contract: 'ESZ25', firstDate: '2025-11-03', lastDate: '2025-11-03', bars: 2, usableBars: 1, errors: 1, warnings: 1, info: 0 },
    ]);
  });
});

describe('contractHealth dates', () => {
  it('reports the first and last trading date for each contract', () => {
    const bars = [bar({ at: '2025-11-05T09:30' }), bar({ at: '2025-11-03T09:30' })];
    expect(contractHealth(bars, bars, [])[0]).toMatchObject({ firstDate: '2025-11-03', lastDate: '2025-11-05' });
  });
});
