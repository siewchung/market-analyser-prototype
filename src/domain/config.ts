import type { AnalysisConfig, IssueKind, QualityIssue, RejectReason, Severity } from './types';

/** Default thresholds. Chosen for one-minute futures bars; see README for the reasoning. */
export const DEFAULT_CONFIG: AnalysisConfig = {
  gapThresholdMinutes: 5,
  sessionBreak: { startMinute: 16 * 60, endMinute: 17 * 60 }, // CME daily maintenance break, 16:00-17:00 CT
  outlierK: 10,
  vwapWindowMinutes: 15,
  maxChartPoints: 2000,
  maxIssueRows: 1000,
};

/** How serious each kind of issue is. TypeScript forces a value for every kind, so new checks can't be forgotten here. */
export const SEVERITY: Readonly<Record<IssueKind, Severity>> = {
  duplicate_exact: 'warning',
  duplicate_conflict: 'error',
  invalid_price: 'error',
  invalid_volume: 'warning',
  gap: 'warning',
  out_of_order: 'warning',
  outlier: 'warning',
  no_range_zero_volume: 'info',
};

/** Plain-English names for each issue kind, shown to business users. */
export const ISSUE_LABELS: Readonly<Record<IssueKind, string>> = {
  duplicate_exact: 'Exact duplicates',
  duplicate_conflict: 'Conflicting duplicates',
  invalid_price: 'Impossible prices',
  invalid_volume: 'Bad volume',
  gap: 'Data gaps',
  out_of_order: 'Out of order',
  outlier: 'Unusual price moves',
  no_range_zero_volume: 'Flat bars, no trades',
};

type PriceReason = Extract<QualityIssue, { kind: 'invalid_price' }>['reason'];
type VolumeReason = Extract<QualityIssue, { kind: 'invalid_volume' }>['reason'];

/** Plain-English names for the specific reason behind a problem (lower case, so they fit mid-sentence). */
export const REASON_LABELS: Readonly<Record<PriceReason | VolumeReason | RejectReason, string>> = {
  non_positive: 'zero or negative price',
  high_below_low: 'high below low',
  open_outside_range: 'open outside the high-low range',
  close_outside_range: 'close outside the high-low range',
  missing: 'missing volume',
  negative: 'negative volume',
  non_integer: 'fractional volume',
  missing_contract: 'no contract symbol',
  bad_timestamp: 'unreadable timestamp',
  missing_price: 'missing price',
  non_numeric_price: 'text where a price should be',
};
