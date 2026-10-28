import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../../src/domain/config';
import { generateInsights, type InsightContext } from '../../../../src/domain/insights/rules';
import type { QualityIssue, RejectedRow } from '../../../../src/domain/types';
import { wall } from '../../../helpers';

const context = (overrides: Partial<InsightContext>): InsightContext => ({
  barsPerContract: new Map([['ESZ25', 1]]),
  rejected: [],
  issues: [],
  config: DEFAULT_CONFIG,
  ...overrides,
});

const issue = (kind: QualityIssue['kind'], at = '2025-11-03T09:30', extra: object = {}): QualityIssue =>
  ({ kind, contract: 'ESZ25', timestamp: wall(at), sourceRows: [1], ...extra }) as QualityIssue;

const gap = (startAt: string, endAt: string, gapMinutes = 10): QualityIssue =>
  issue('gap', endAt, { gapMinutes, previousTimestamp: wall(startAt) });

const ids = (ctx: InsightContext): string[] => generateInsights(ctx).map((i) => i.id);

describe('generateInsights', () => {
  it('returns nothing for clean data', () => {
    expect(generateInsights(context({}))).toEqual([]);
  });

  it('summarises rejected rows by reason with a suggested rule', () => {
    const rejected: RejectedRow[] = [
      { sourceRow: 1, reason: 'missing_price', raw: {} },
      { sourceRow: 2, reason: 'missing_price', raw: {} },
      { sourceRow: 3, reason: 'bad_timestamp', raw: {} },
    ];
    const insights = generateInsights(context({ rejected }));
    const missing = insights.find((i) => i.id === 'rejected-missing_price');
    expect(missing).toMatchObject({ severity: 'error', evidence: { kind: 'rejected_row', count: 2 } });
    expect(missing?.suggestedRule).toMatch(/mandatory/i);
    expect(ids(context({ rejected }))).toContain('rejected-bad_timestamp');
  });

  it('treats conflicting duplicates as more serious than exact copies', () => {
    const insights = generateInsights(context({ issues: [issue('duplicate_conflict'), issue('duplicate_exact'), issue('duplicate_exact')] }));
    expect(insights.find((i) => i.id === 'duplicate_conflict')).toMatchObject({ severity: 'error', evidence: { count: 1 } });
    expect(insights.find((i) => i.id === 'duplicate_exact')).toMatchObject({ severity: 'warning', evidence: { count: 2 } });
  });

  it('reports invalid prices and volumes per reason', () => {
    const issues = [
      issue('invalid_price', undefined, { reason: 'high_below_low' }),
      issue('invalid_volume', undefined, { reason: 'negative' }),
      issue('invalid_volume', undefined, { reason: 'missing' }),
    ];
    expect(ids(context({ issues }))).toEqual(expect.arrayContaining(['invalid_price-high_below_low', 'invalid_volume-negative', 'invalid_volume-missing']));
  });

  it('describes what happened to each kind of bad volume accurately', () => {
    const insights = generateInsights(context({ issues: [issue('invalid_volume', undefined, { reason: 'non_integer' }), issue('invalid_volume', undefined, { reason: 'negative' })] }));
    expect(insights.find((i) => i.id === 'invalid_volume-non_integer')?.detail).toMatch(/kept as reported/);
    expect(insights.find((i) => i.id === 'invalid_volume-negative')?.detail).toMatch(/counts as zero/);
  });

  it('writes grammatical titles for single rows', () => {
    const insights = generateInsights(context({ rejected: [{ sourceRow: 1, reason: 'missing_contract', raw: {} }] }));
    expect(insights[0]?.title).toBe('1 row with no contract symbol');
  });

  it('spots gaps that cluster at one time of day', () => {
    const issues = [
      ...Array.from({ length: 8 }, (_, d) => gap(`2025-11-0${d + 1}T15:10`, `2025-11-0${d + 1}T15:30`)),
      gap('2025-11-03T09:00', '2025-11-03T09:10'),
      gap('2025-11-03T11:00', '2025-11-03T11:10'),
    ];
    const insight = generateInsights(context({ issues })).find((i) => i.id === 'gap-cluster-ESZ25');
    expect(insight).toMatchObject({ evidence: { kind: 'gap', contract: 'ESZ25', count: 8, share: 0.8 } });
    expect(insight?.title).toMatch(/15:00/);
  });

  it('recognises gaps spread across the whole day as thin trading', () => {
    const issues = Array.from({ length: 12 }, (_, h) => gap(`2025-11-03T${String(h + 5).padStart(2, '0')}:00`, `2025-11-03T${String(h + 5).padStart(2, '0')}:10`));
    const insights = generateInsights(context({ issues }));
    expect(insights.map((i) => i.id)).toContain('gap-spread-ESZ25');
    expect(insights.map((i) => i.id)).not.toContain('gap-cluster-ESZ25');
  });

  it('does not look for time-of-day patterns with only a few gaps', () => {
    expect(ids(context({ issues: [gap('2025-11-03T15:00', '2025-11-03T15:10')] }))).toEqual(['gap-few-ESZ25']);
  });

  it('suggests a holiday calendar for missing weekdays in daily data', () => {
    const issues = [gap('2025-11-26T00:00', '2025-11-28T00:00', 1440)];
    expect(ids(context({ issues }))).toEqual(['gap-daily-ESZ25']);
  });

  it('flags contracts dominated by flat zero-volume bars', () => {
    const barsPerContract = new Map([['ESZ25', 4]]);
    const issues = [issue('no_range_zero_volume'), issue('no_range_zero_volume')];
    const insight = generateInsights(context({ barsPerContract, issues })).find((i) => i.id === 'no_range_zero_volume-ESZ25');
    expect(insight).toMatchObject({ severity: 'info', evidence: { share: 0.5 } });
  });

  it('ignores a few flat zero-volume bars in an otherwise busy contract', () => {
    const barsPerContract = new Map([['ESZ25', 100]]);
    expect(ids(context({ barsPerContract, issues: [issue('no_range_zero_volume')] }))).toEqual([]);
  });

  it('explains when price jumps mostly come straight after data gaps', () => {
    const issues = [
      gap('2025-11-03T09:00', '2025-11-03T09:30'),
      issue('outlier', '2025-11-03T09:30', { returnPct: 2, score: 20 }),
    ];
    const insight = generateInsights(context({ issues })).find((i) => i.id === 'outlier');
    expect(insight?.detail).toMatch(/after a data gap/i);
  });

  it('lists errors before warnings before info', () => {
    const issues = [issue('out_of_order'), issue('invalid_price', undefined, { reason: 'non_positive' })];
    const rejected: RejectedRow[] = [{ sourceRow: 9, reason: 'bad_timestamp', raw: {} }];
    const severities = generateInsights(context({ issues, rejected })).map((i) => i.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b)));
    expect(severities[0]).toBe('error');
  });
});
