import { REASON_LABELS } from '../domain/config';
import type { BarInterval, QualityIssue } from '../domain/types';
import { formatDateTime, formatNumber, sentenceCase } from './format';

/** The kind-specific detail for one issue, in plain words. */
export function describeIssue(issue: QualityIssue): string {
  switch (issue.kind) {
    case 'invalid_price':
    case 'invalid_volume':
      return sentenceCase(REASON_LABELS[issue.reason]);
    case 'gap':
      return `${formatNumber(issue.gapMinutes)} min of open-market time with no bars, since ${formatDateTime(issue.previousTimestamp)}`;
    case 'outlier':
      return `${issue.returnPct > 0 ? '+' : ''}${formatNumber(issue.returnPct, 3)}% move (${formatNumber(issue.score, 1)}x typical)`;
    case 'duplicate_exact':
      return 'Identical copy';
    case 'duplicate_conflict':
      return 'Same time, different values';
    case 'out_of_order':
      return 'Earlier than a previous row';
    case 'no_range_zero_volume':
      return 'Flat bar, zero volume';
  }
}

/**
 * When an issue happened, as "2025-03-12 09:31" (Chicago wall-clock time).
 * Daily bars are date labels with no time of day, so they show the date only.
 */
export function formatIssueTime(timestamp: number, interval: BarInterval): string {
  const iso = new Date(timestamp).toISOString(); // reads the wall-clock value as UTC, i.e. unchanged
  return interval === 'daily' ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}
