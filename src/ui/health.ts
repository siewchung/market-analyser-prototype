import type { QualityReport } from '../application/qualityReport';

/**
 * Share of records usable for analytics, as a percentage to one decimal place (e.g. "99.2").
 * Rounded down, so data with even one bad row never shows as a perfect "100.0".
 */
export function usablePercent(report: Pick<QualityReport, 'cleanRows' | 'totalRows'>): string {
  if (report.totalRows === 0) return '0.0';
  return (Math.floor((report.cleanRows / report.totalRows) * 1000) / 10).toFixed(1);
}
