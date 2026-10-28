import { fileInterval, rootOf } from '../domain/bars';
import { SEVERITY } from '../domain/config';
import { generateInsights } from '../domain/insights/rules';
import type {
  AnalysisConfig,
  BarInterval,
  Insight,
  IssueKind,
  LoadSummary,
  QualityIssue,
  RejectedRow,
  Severity,
} from '../domain/types';
import type { Dataset } from './analyse';

/**
 * The data quality report shown on the Overview and Quality screens.
 *
 * It can cover many files at once (the whole sample: 40 contracts, minute and daily), so it is built from small
 * per-file summaries rather than from the bars themselves. That lets a script analyse one file at a time and keep
 * memory low, then save the finished report as JSON for the app to load at startup.
 */

/** Bump this whenever the report's shape or the quality rules change, then re-run `npm run build-quality-report`. */
export const QUALITY_REPORT_VERSION = 2;
/** The full issue list can run to hundreds of thousands of rows, so the report keeps a sample of each severity. */
export const ISSUE_SAMPLE_PER_SEVERITY = 200;
export const REJECTED_SAMPLE_SIZE = 200;

/** What one analysed file contributes to a report. Holds no bars, so many files fit in memory. */
export interface FileAnalysis {
  readonly fileName: string;
  readonly interval: BarInterval;
  readonly summary: LoadSummary;
  readonly issues: readonly QualityIssue[];
  readonly rejected: readonly RejectedRow[];
}

/** An issue plus whether it came from daily or intraday data (daily timestamps are dates only). */
export interface ReportIssue {
  readonly issue: QualityIssue;
  readonly interval: BarInterval;
}

/** A rejected row plus the file it came from, since the report can cover many files. */
export interface ReportRejected {
  readonly fileName: string;
  readonly row: RejectedRow;
}

/** One row of the contracts table: a contract across all of its files. */
export interface ReportContract {
  readonly contract: string;
  readonly root: string; // e.g. "ES" for "ESZ25"
  readonly intervals: readonly BarInterval[]; // 'intraday' before 'daily'
  readonly firstDate: string;
  readonly lastDate: string;
  readonly bars: number; // all files added together (minute + daily)
  readonly barsByInterval: Readonly<Record<BarInterval, number>>; // the same, split by kind of file
  readonly errors: number;
  readonly warnings: number;
  readonly info: number;
}

export interface QualityReport {
  readonly version: number;
  readonly files: Readonly<Record<BarInterval, number>>; // how many files of each kind
  readonly totalRows: number;
  readonly acceptedRows: number;
  readonly rejectedRows: number;
  readonly cleanRows: number;
  readonly dateRange: { readonly from: string; readonly to: string } | null;
  readonly roots: readonly string[];
  readonly issueCounts: Readonly<Record<IssueKind, number>>;
  readonly severityCounts: Readonly<Record<Severity, number>>;
  readonly contracts: readonly ReportContract[]; // sorted by contract
  readonly insights: readonly Insight[];
  readonly issueSample: readonly ReportIssue[]; // up to ISSUE_SAMPLE_PER_SEVERITY per severity, most serious first, then by time
  readonly rejectedSample: readonly ReportRejected[];
}

/** Keeps only what the report needs from a loaded file, so the bars can be thrown away. */
export function toFileAnalysis(fileName: string, dataset: Dataset): FileAnalysis {
  return {
    fileName,
    interval: fileInterval(dataset.cleanBars),
    summary: dataset.summary,
    issues: dataset.issues,
    rejected: dataset.rejected,
  };
}

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'info'];
const INTERVAL_ORDER: readonly BarInterval[] = ['intraday', 'daily'];

/** Combines per-file analyses into one report. With a single file, the totals match that file's own summary. */
export function buildQualityReport(files: readonly FileAnalysis[], config: AnalysisConfig): QualityReport {
  const issueCounts = Object.fromEntries(Object.keys(SEVERITY).map((kind) => [kind, 0])) as Record<IssueKind, number>;
  const severityCounts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  const fileCounts: Record<BarInterval, number> = { intraday: 0, daily: 0 };
  const contracts = new Map<string, { -readonly [K in keyof ReportContract]: ReportContract[K] }>();
  let totalRows = 0;
  let acceptedRows = 0;
  let rejectedRows = 0;
  let cleanRows = 0;
  let from = '';
  let to = '';

  for (const file of files) {
    const { summary } = file;
    fileCounts[file.interval]++;
    totalRows += summary.totalRows;
    acceptedRows += summary.acceptedRows;
    rejectedRows += summary.rejectedRows;
    cleanRows += summary.cleanRows;
    if (summary.dateRange) {
      // "YYYY-MM-DD" strings sort the same way as the dates they stand for.
      if (from === '' || summary.dateRange.from < from) from = summary.dateRange.from;
      if (summary.dateRange.to > to) to = summary.dateRange.to;
    }
    for (const kind of Object.keys(summary.issueCounts) as IssueKind[]) {
      issueCounts[kind] += summary.issueCounts[kind];
      severityCounts[SEVERITY[kind]] += summary.issueCounts[kind];
    }

    // The same contract can appear in several files (e.g. its minute file and its daily file): add them together.
    for (const health of summary.byContract) {
      const existing = contracts.get(health.contract);
      if (!existing) {
        contracts.set(health.contract, {
          contract: health.contract,
          root: rootOf(health.contract),
          intervals: [file.interval],
          firstDate: health.firstDate,
          lastDate: health.lastDate,
          bars: health.bars,
          barsByInterval: { intraday: 0, daily: 0, [file.interval]: health.bars },
          errors: health.errors,
          warnings: health.warnings,
          info: health.info,
        });
        continue;
      }
      existing.intervals = INTERVAL_ORDER.filter((i) => i === file.interval || existing.intervals.includes(i));
      if (health.firstDate < existing.firstDate) existing.firstDate = health.firstDate;
      if (health.lastDate > existing.lastDate) existing.lastDate = health.lastDate;
      existing.bars += health.bars;
      existing.barsByInterval = { ...existing.barsByInterval, [file.interval]: existing.barsByInterval[file.interval] + health.bars };
      existing.errors += health.errors;
      existing.warnings += health.warnings;
      existing.info += health.info;
    }
  }

  const contractRows = [...contracts.values()].sort((a, b) => a.contract.localeCompare(b.contract));
  const allIssues = files.flatMap((f) => f.issues);
  const allRejected = files.flatMap((f) => f.rejected);

  return {
    version: QUALITY_REPORT_VERSION,
    files: fileCounts,
    totalRows,
    acceptedRows,
    rejectedRows,
    cleanRows,
    dateRange: from === '' ? null : { from, to },
    roots: [...new Set(contractRows.map((c) => c.root))].sort(),
    issueCounts,
    severityCounts,
    contracts: contractRows,
    insights: generateInsights({
      barsPerContract: new Map(contractRows.map((c) => [c.contract, c.bars])),
      rejected: allRejected,
      issues: allIssues,
      config,
    }),
    issueSample: sampleIssues(files),
    rejectedSample: files.flatMap((f) => f.rejected.map((row) => ({ fileName: f.fileName, row }))).slice(0, REJECTED_SAMPLE_SIZE),
  };
}

/** Takes the first issues of each severity, most serious first and then oldest first. */
function sampleIssues(files: readonly FileAnalysis[]): ReportIssue[] {
  const all: ReportIssue[] = files.flatMap((f) => f.issues.map((issue) => ({ issue, interval: f.interval })));
  return SEVERITY_ORDER.flatMap((severity) =>
    all
      .filter((s) => SEVERITY[s.issue.kind] === severity)
      .sort((a, b) => a.issue.timestamp - b.issue.timestamp)
      .slice(0, ISSUE_SAMPLE_PER_SEVERITY),
  );
}
