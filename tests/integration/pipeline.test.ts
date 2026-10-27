import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load, query, type Dataset } from '../../src/application/analyse';
import { parseFile } from '../../src/infrastructure/parsers';

/**
 * End-to-end: real file bytes -> parser -> normalise -> checks -> clean -> analytics -> insights.
 * Uses the hand-made dirty CSV (exact expected counts) and the real sample Parquet files (sanity checks).
 */
const loadFixture = async (name: string): Promise<Dataset> => {
  const buf = readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
  return load(name, await parseFile(name, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
};

describe('pipeline: dirty.csv', async () => {
  const dataset = await loadFixture('dirty.csv');

  it('accounts for every row', () => {
    expect(dataset.summary).toMatchObject({ fileName: 'dirty.csv', totalRows: 27, acceptedRows: 22, rejectedRows: 5, cleanRows: 18 });
    expect(dataset.summary.contracts).toEqual(['CLZ25', 'ESZ25']);
    expect(dataset.summary.dateRange).toEqual({ from: '2025-11-03', to: '2025-11-04' });
  });

  it('finds every planted problem', () => {
    expect(dataset.summary.issueCounts).toEqual({
      duplicate_exact: 1, // line 5 copies line 4
      duplicate_conflict: 1, // line 7 differs from line 6 on volume
      invalid_price: 2, // line 8 high < low, line 9 negative open
      invalid_volume: 3, // lines 10 (negative), 11 (fractional), 12 (missing)
      out_of_order: 1, // line 16 goes back to 09:45
      gap: 4, // three on ESZ25, one overnight on CLZ25; the 16:00-17:00 break is not counted
      outlier: 2, // the spike at 09:51 and the drop back at 09:52
      no_range_zero_volume: 1, // line 17
    });
    expect(dataset.rejected.map((r) => [r.sourceRow, r.reason])).toEqual([
      // Row numbers match the CSV's line numbers in Excel (line 1 is the header).
      [20, 'missing_contract'],
      [21, 'bad_timestamp'],
      [22, 'missing_price'],
      [23, 'non_numeric_price'],
      [24, 'missing_price'],
    ]);
  });

  it('breaks quality down by contract', () => {
    expect(dataset.summary.byContract).toEqual([
      { contract: 'CLZ25', firstDate: '2025-11-03', lastDate: '2025-11-04', bars: 4, usableBars: 4, errors: 0, warnings: 1, info: 0 },
      { contract: 'ESZ25', firstDate: '2025-11-03', lastDate: '2025-11-04', bars: 18, usableBars: 14, errors: 3, warnings: 10, info: 1 },
    ]);
  });

  it('produces insights, most serious first', () => {
    expect(dataset.insights.length).toBeGreaterThan(0);
    expect(dataset.insights[0]?.severity).toBe('error');
    expect(dataset.insights.map((i) => i.id)).toEqual(expect.arrayContaining(['duplicate_conflict', 'rejected-missing_price', 'out_of_order']));
  });

  it('builds daily bars from cleaned data only', () => {
    const { daily } = query(dataset, { contracts: ['CLZ25'] });
    expect(daily).toEqual([
      { contract: 'CLZ25', tradingDate: '2025-11-03', open: 60.1, high: 60.7, low: 60, close: 60.6, volume: 950, barCount: 2 },
      { contract: 'CLZ25', tradingDate: '2025-11-04', open: 61, high: 61.3, low: 60.9, close: 61.25, volume: 780, barCount: 2 },
    ]);
  });

  it('filters by contract and date range, and caps nothing when small', () => {
    const result = query(dataset, { contracts: ['CLZ25'], from: '2025-11-04', to: '2025-11-04' });
    expect(result.chartContract).toBe('CLZ25');
    expect(result.chartRange?.mode).toBe('filtered');
    expect(result.daily.map((d) => d.tradingDate)).toEqual(['2025-11-04']);
    expect(result.vwap).toHaveLength(2);
  });

  it('defaults the chart to the first contract', () => {
    const result = query(dataset, { contracts: [] });
    expect(result.chartContract).toBe('CLZ25');
    expect(result.chartRange).toEqual({ from: '2025-11-04', to: '2025-11-04', mode: 'latest_day' }); // too little data for an 'active' day
  });
});

describe('pipeline: view options', async () => {
  const dataset = await loadFixture('dirty.csv');

  it('lists the chart days and can show a chosen day without changing the daily table', () => {
    const result = query(dataset, { contracts: ['CLZ25'] }, { chartDay: '2025-11-03' });
    expect(result.chartDays).toEqual(['2025-11-03', '2025-11-04']);
    expect(result.chartRange).toEqual({ from: '2025-11-03', to: '2025-11-03', mode: 'chosen_day' });
    expect(result.daily).toHaveLength(2); // the table still covers the whole filter
  });

  it('ignores a chosen day the contract has no data for', () => {
    expect(query(dataset, { contracts: ['CLZ25'] }, { chartDay: '2030-01-01' }).chartRange?.mode).not.toBe('chosen_day');
  });
});

describe('pipeline: exclude bars with errors', async () => {
  const dataset = await loadFixture('dirty.csv');
  const volumeOn = (result: ReturnType<typeof query>, date: string): number => result.daily.find((d) => d.tradingDate === date)?.volume ?? 0;

  it('excludes bars with errors by default', () => {
    expect(volumeOn(query(dataset, { contracts: ['ESZ25'] }), '2025-11-03')).toBe(
      volumeOn(query(dataset, { contracts: ['ESZ25'], excludeErrors: true }), '2025-11-03'),
    );
  });

  it('keeps bars with impossible prices and conflicting duplicates when the toggle is off', () => {
    const on = query(dataset, { contracts: ['ESZ25'] });
    const off = query(dataset, { contracts: ['ESZ25'], excludeErrors: false });
    // Line 8 (high below low, volume 80), line 9 (negative open, volume 70) and line 7 (conflicting copy, volume 115).
    expect(volumeOn(off, '2025-11-03')).toBe(volumeOn(on, '2025-11-03') + 80 + 70 + 115);
  });

  it('counts issues per trading day for the chart contract', () => {
    const result = query(dataset, { contracts: ['ESZ25'] });
    const total = Object.values(result.issuesByDay).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(dataset.issues.filter((i) => i.contract === 'ESZ25').length);
  });
});

describe('pipeline: real sample data', () => {
  it('handles the real minute file: no rejections, volume conserved from minute to daily bars', async () => {
    const dataset = await loadFixture('sample-minute.parquet');
    expect(dataset.summary).toMatchObject({ totalRows: 97384, acceptedRows: 97384, rejectedRows: 0, contracts: ['ZNH26'] });
    expect(dataset.summary.issueCounts.duplicate_exact + dataset.summary.issueCounts.invalid_price).toBe(0); // the vendor reports none

    const result = query(dataset, { contracts: [] });
    const minuteVolume = dataset.cleanBars.reduce((sum, b) => sum + (b.volume ?? 0), 0);
    expect(result.daily.reduce((sum, d) => sum + d.volume, 0)).toBe(minuteVolume);
    expect(minuteVolume).toBe(107312444); // matches reported_total_volume in the dataset's files.csv
    expect(result.barInterval).toBe('intraday');
    // The contract's final days are nearly empty, so the chart opens on the latest day with an hour or more of trading.
    expect(result.chartRange?.mode).toBe('latest_active_day');
    expect(result.chartRange?.from).toBe(result.chartRange?.to);
    expect(result.chartRange!.from < '2026-03-20').toBe(true);
    expect(result.vwap.length).toBeGreaterThanOrEqual(60);
    expect(result.vwap.length).toBeGreaterThan(0);
    expect(result.vwap.length).toBeLessThanOrEqual(2000);
    expect(dataset.insights.map((i) => i.id)).toContain('gap-spread-ZNH26');
  });

  it('rolls minute bars into the same trading days as the vendor (CME 17:00 session rule)', async () => {
    // The vendor's minute file only holds about half of each day's reported volume, so exact volume can't match.
    // Daily high and low should, on most days, if bars are assigned to the right session.
    // Using the calendar date instead matches only about 26% of days; the session rule matches about 62%.
    const ours = query(await loadFixture('sample-minute.parquet'), { contracts: [] }).daily;
    const vendor = new Map(query(await loadFixture('sample-daily.parquet'), { contracts: [] }).daily.map((d) => [d.tradingDate, d]));
    const compared = ours.filter((d) => vendor.has(d.tradingDate));
    const matching = compared.filter((d) => vendor.get(d.tradingDate)?.high === d.high && vendor.get(d.tradingDate)?.low === d.low);
    expect(ours.some((d) => new Date(`${d.tradingDate}T00:00:00Z`).getUTCDay() === 0)).toBe(false); // no Sunday "days"
    expect(matching.length / compared.length).toBeGreaterThan(0.55);
  });

  it('handles the real daily file and recognises missing weekdays as likely holidays', async () => {
    const dataset = await loadFixture('sample-daily.parquet');
    expect(dataset.summary).toMatchObject({ totalRows: 190, rejectedRows: 0 });
    expect(query(dataset, { contracts: [] }).daily).toHaveLength(190);
    expect(dataset.insights.map((i) => i.id)).toEqual(expect.arrayContaining(['gap-daily-ZNH26']));
  });

  it('charts the whole history of a daily file, not a single point', async () => {
    const dataset = await loadFixture('sample-daily.parquet');
    const result = query(dataset, { contracts: [] });
    expect(result.barInterval).toBe('daily');
    expect(result.chartRange).toEqual({ ...dataset.summary.dateRange, mode: 'whole_history' });
    expect(result.vwap).toHaveLength(190); // every day, well under the 2,000-point limit so nothing is thinned out
  });

  it('lets a date range zoom into a daily file, and ignores a chosen single day', async () => {
    const dataset = await loadFixture('sample-daily.parquet');
    const zoomed = query(dataset, { contracts: [], from: '2025-12-01', to: '2025-12-31' });
    expect(zoomed.chartRange).toMatchObject({ mode: 'filtered' });
    expect(zoomed.barInterval).toBe('daily');
    expect(zoomed.vwap.length).toBeGreaterThan(15);
    // Stepping day by day isn't offered for daily data, so a stray chartDay doesn't shrink the chart to one point.
    expect(query(dataset, { contracts: [] }, { chartDay: '2025-12-01' }).chartRange?.mode).toBe('whole_history');
  });
});
