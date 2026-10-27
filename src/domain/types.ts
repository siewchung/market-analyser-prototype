/**
 * Core data shapes shared by every layer of the app.
 *
 * Time convention used everywhere:
 * timestamps are "wall-clock milliseconds" - the Chicago local time stored as if it were UTC.
 * Example: 09:30 in Chicago is stored as the epoch ms for 09:30 UTC.
 * Always read them with getUTC* methods so the viewer's own timezone and daylight saving never shift them.
 */

/** One row exactly as the file parser returned it, before any cleaning. */
export type RawRecord = Readonly<Record<string, unknown>>;

/** What a file parser hands back: the rows, plus the row number of the first data row as a user would count it. */
export interface ParsedFile {
  readonly records: readonly RawRecord[];
  readonly firstRowNumber: number; // CSV: 2 (line 1 is the header, matching Excel); Parquet: 1
}

/** A single price bar (one row of market data) after its values have been converted to proper types. */
export interface Bar {
  readonly contract: string; // e.g. "ESZ25"
  readonly timestamp: number; // wall-clock ms (see note at top of file)
  readonly tradingDate: string; // "YYYY-MM-DD", the exchange trading day
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null; // null = not reported, which is different from 0
  readonly sourceRow: number; // row number in the uploaded file as a user would see it (for CSV: the line number in Excel)
}

/** Why a row could not be turned into a Bar. */
export type RejectReason = 'missing_contract' | 'bad_timestamp' | 'missing_price' | 'non_numeric_price';

/** A row we could not use, kept so the user can see what was wrong with it. */
export interface RejectedRow {
  readonly sourceRow: number;
  readonly reason: RejectReason;
  readonly raw: RawRecord;
}

/** Fields every quality issue has in common. */
interface IssueBase {
  readonly contract: string;
  readonly timestamp: number;
  readonly sourceRows: readonly number[]; // which file rows are involved
}

/** One data quality problem. `kind` tells you which check found it; extra fields depend on the kind. */
export type QualityIssue =
  | (IssueBase & { readonly kind: 'duplicate_exact' })
  | (IssueBase & { readonly kind: 'duplicate_conflict' }) // same contract + time but different values
  | (IssueBase & {
      readonly kind: 'invalid_price';
      readonly reason: 'non_positive' | 'high_below_low' | 'open_outside_range' | 'close_outside_range';
    })
  | (IssueBase & { readonly kind: 'invalid_volume'; readonly reason: 'negative' | 'non_integer' | 'missing' })
  | (IssueBase & { readonly kind: 'gap'; readonly gapMinutes: number; readonly previousTimestamp: number })
  | (IssueBase & { readonly kind: 'out_of_order' })
  | (IssueBase & { readonly kind: 'outlier'; readonly returnPct: number; readonly score: number })
  | (IssueBase & { readonly kind: 'no_range_zero_volume' }); // settlement-like bar, informational only

export type IssueKind = QualityIssue['kind'];

export type Severity = 'error' | 'warning' | 'info';

/** One day of trading summarised into a single bar. */
export interface DailyBar {
  readonly contract: string;
  readonly tradingDate: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly barCount: number; // how many source bars made up this day
}

/** Close price and rolling VWAP at one point in time. */
export interface VwapPoint {
  readonly contract: string;
  readonly timestamp: number;
  readonly tradingDate: string;
  readonly close: number;
  readonly vwap: number | null; // null when no volume traded in the window
}

/** What the user selected in the filters. Empty `contracts` means all contracts. Dates are inclusive "YYYY-MM-DD". */
export interface Filter {
  readonly contracts: readonly string[];
  readonly from?: string;
  readonly to?: string;
  readonly excludeErrors?: boolean; // leave bars with error-level issues out of the analytics (default: true)
}

/** A recurring pattern found in the quality issues, with a rule we suggest adopting. */
export interface Insight {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly suggestedRule: string;
  readonly severity: Severity;
  readonly evidence: {
    readonly kind: IssueKind | 'rejected_row';
    readonly contract?: string;
    readonly count: number;
    readonly share: number; // 0..1, e.g. "80% of gaps"
  };
}

/** Tunable thresholds. Defaults live in config.ts; tests can override any value. */
export interface AnalysisConfig {
  readonly gapThresholdMinutes: number;
  readonly sessionBreak: { readonly startMinute: number; readonly endMinute: number }; // minutes after midnight CT
  readonly outlierK: number; // how many MADs away counts as an outlier
  readonly vwapWindowMinutes: number;
  readonly maxChartPoints: number;
  readonly maxIssueRows: number;
}

/** Quality at a glance for one contract, so users can see which contracts are fine and which aren't. */
export interface ContractHealth {
  readonly contract: string;
  readonly firstDate: string; // first trading day with a readable bar, "YYYY-MM-DD"
  readonly lastDate: string; // last trading day with a readable bar
  readonly bars: number; // readable bars for this contract
  readonly usableBars: number; // bars left after cleaning
  readonly errors: number;
  readonly warnings: number;
  readonly info: number;
}

/** Headline numbers shown right after a file loads. */
export interface LoadSummary {
  readonly fileName: string;
  readonly totalRows: number;
  readonly acceptedRows: number; // rows that became Bars
  readonly rejectedRows: number;
  readonly cleanRows: number; // Bars used for analytics after dedupe and invalid-price removal
  readonly contracts: readonly string[];
  readonly dateRange: { readonly from: string; readonly to: string } | null; // null when no rows survived
  readonly issueCounts: Readonly<Record<IssueKind, number>>;
  readonly byContract: readonly ContractHealth[];
  readonly priceDecimals: Readonly<Record<string, number>>; // per contract, so prices line up in tables and charts
}

/**
 * How the chart's dates were chosen: a day the user stepped to, the user's date filter, the default single-day view
 * (minute data), or the whole file (daily data, where one day is only a single point).
 */
export type ChartMode = 'chosen_day' | 'filtered' | 'latest_active_day' | 'latest_day' | 'whole_history';

/** How far apart the chart contract's bars are: one per trading day ('daily'), or several per day ('intraday', e.g. minute bars). */
export type BarInterval = 'daily' | 'intraday';

/**
 * View-only choices that don't change the data being analysed, unlike Filter.
 * Kept separate so that, for example, stepping the chart through days doesn't shrink the daily bars table.
 */
export interface ViewOptions {
  readonly chartDay?: string; // "YYYY-MM-DD": show this single day on the chart
}

/** Everything the dashboard needs for the current filter. */
export interface QueryResult {
  readonly daily: readonly DailyBar[];
  readonly chartContract: string | null; // the chart shows one contract at a time
  readonly barInterval: BarInterval; // daily data is charted differently: whole history, and no VWAP line
  // Dates the chart covers, and why. With no date filter, minute data shows a single day, because a 15-minute VWAP
  // is only meaningful at intraday zoom: the latest day with at least an hour of trading, or failing that the latest day.
  // Daily data shows every day in the file instead, so the price movement is visible.
  readonly chartRange: { readonly from: string; readonly to: string; readonly mode: ChartMode } | null;
  readonly chartDays: readonly string[]; // every trading day the chart contract has data for (within the date filter), oldest first
  readonly vwap: readonly VwapPoint[]; // for chartContract and chartRange only, downsampled for the chart
  readonly issuesByDay: Readonly<Record<string, number>>; // chartContract's issue count per trading day, for the daily bars table
}
