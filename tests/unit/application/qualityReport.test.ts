import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load, type Dataset } from '../../../src/application/analyse';
import { buildQualityReport, ISSUE_SAMPLE_PER_SEVERITY, toFileAnalysis } from '../../../src/application/qualityReport';
import { DEFAULT_CONFIG, SEVERITY } from '../../../src/domain/config';
import type { IssueKind, QualityIssue } from '../../../src/domain/types';
import { parseFile } from '../../../src/infrastructure/parsers';
import { wall } from '../../helpers';

const loadFixture = async (name: string): Promise<Dataset> => {
  const buf = readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
  return load(name, await parseFile(name, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
};

describe('buildQualityReport', async () => {
  const dirty = await loadFixture('dirty.csv');
  const znMinute = await loadFixture('sample-minute.parquet');
  const znDaily = await loadFixture('sample-daily.parquet');

  it('gives the same totals as a live load for a single uploaded file', () => {
    const report = buildQualityReport([toFileAnalysis('dirty.csv', dirty)], DEFAULT_CONFIG);
    expect(report).toMatchObject({
      totalRows: dirty.summary.totalRows,
      acceptedRows: dirty.summary.acceptedRows,
      rejectedRows: dirty.summary.rejectedRows,
      cleanRows: dirty.summary.cleanRows,
      issueCounts: dirty.summary.issueCounts,
      files: { intraday: 1, daily: 0 },
    });
    expect(report.rejectedSample.map((r) => [r.fileName, r.row.sourceRow])).toContainEqual(['dirty.csv', 20]);
  });

  it('merges the minute and daily files of one contract into one contract row', () => {
    const report = buildQualityReport(
      [toFileAnalysis('sample-minute.parquet', znMinute), toFileAnalysis('sample-daily.parquet', znDaily)],
      DEFAULT_CONFIG,
    );
    expect(report.files).toEqual({ intraday: 1, daily: 1 });
    expect(report.totalRows).toBe(znMinute.summary.totalRows + znDaily.summary.totalRows);
    expect(report.contracts).toHaveLength(1);
    expect(report.contracts[0]).toMatchObject({ root: 'ZN', intervals: ['intraday', 'daily'] });
    expect(report.roots).toEqual(['ZN']);
  });

  it('adds up issue counts by severity', () => {
    const report = buildQualityReport([toFileAnalysis('dirty.csv', dirty)], DEFAULT_CONFIG);
    const expected = { error: 0, warning: 0, info: 0 };
    for (const [kind, count] of Object.entries(dirty.summary.issueCounts)) expected[SEVERITY[kind as IssueKind]] += count;
    expect(report.severityCounts).toEqual(expected);
  });

  it('caps the issue sample per severity', () => {
    const gaps: QualityIssue[] = Array.from({ length: 250 }, (_, i) => ({
      kind: 'gap',
      contract: 'ESZ25',
      timestamp: wall('2025-11-03T09:30') + i * 60_000,
      sourceRows: [i + 1],
      gapMinutes: 10,
      previousTimestamp: wall('2025-11-03T09:00'),
    }));
    const file = { ...toFileAnalysis('dirty.csv', dirty), issues: gaps };
    const report = buildQualityReport([file], DEFAULT_CONFIG);
    expect(report.issueSample.filter((s) => SEVERITY[s.issue.kind] === 'warning')).toHaveLength(ISSUE_SAMPLE_PER_SEVERITY);
    expect(report.issueSample.every((s) => s.interval === 'intraday')).toBe(true);
  });
});
