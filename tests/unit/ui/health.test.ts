import { describe, expect, it } from 'vitest';
import type { QualityReport } from '../../../src/application/qualityReport';
import { usablePercent } from '../../../src/ui/health';

const report = (cleanRows: number, totalRows: number) => ({ cleanRows, totalRows }) as QualityReport;

describe('usablePercent', () => {
  it('shows the usable share to one decimal place', () => {
    expect(usablePercent(report(992, 1000))).toBe('99.2');
  });

  it('never rounds up to a perfect 100.0 when some rows are unusable', () => {
    expect(usablePercent(report(5_325_298, 5_325_341))).toBe('99.9');
    expect(usablePercent(report(10, 10))).toBe('100.0');
  });

  it('shows 0.0 for an empty dataset instead of dividing by zero', () => {
    expect(usablePercent(report(0, 0))).toBe('0.0');
  });
});
