import { dailyBars } from '../domain/analytics/dailyBars';
import { priceDecimals } from '../domain/bars';
import { downsample } from '../domain/analytics/downsample';
import { matchesFilter } from '../domain/analytics/filter';
import { rollingVwap } from '../domain/analytics/vwap';
import { DEFAULT_CONFIG, SEVERITY } from '../domain/config';
import { contractHealth } from '../domain/health';
import { generateInsights } from '../domain/insights/rules';
import { normalise } from '../domain/normalise';
import { runChecks } from '../domain/quality/checks';
import { clean } from '../domain/quality/clean';
import { tradingDateFor } from '../domain/time';
import type {
  AnalysisConfig,
  Bar,
  BarInterval,
  ChartMode,
  Filter,
  Insight,
  IssueKind,
  LoadSummary,
  ParsedFile,
  QualityIssue,
  QueryResult,
  RejectedRow,
  Severity,
  ViewOptions,
  VwapPoint,
} from '../domain/types';

/**
 * The two things the app can do, wired together from the domain steps:
 * - load(): run once per uploaded file. Does all the heavy work and keeps the results.
 * - query(): run on every filter change. Only slices what load() already computed, so it's fast.
 *
 * Quality checks and insights always cover the whole file; filters only narrow what is shown.
 */

/** Everything worked out for one uploaded file. */
export interface Dataset {
  readonly summary: LoadSummary;
  readonly insights: readonly Insight[];
  readonly rejected: readonly RejectedRow[];
  readonly issues: readonly QualityIssue[]; // most serious first
  readonly cleanBars: readonly Bar[];
  readonly vwap: readonly VwapPoint[]; // computed on the full history so the window is right at the edge of any date filter
  // The same two, but keeping bars with error-level issues, for when the user turns off "Exclude bars with errors".
  readonly barsWithErrors: readonly Bar[];
  readonly vwapWithErrors: readonly VwapPoint[];
  readonly config: AnalysisConfig;
}

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'info'];

export function load(fileName: string, file: ParsedFile, config: AnalysisConfig = DEFAULT_CONFIG): Dataset {
  const { records } = file;
  const { bars, rejected } = normalise(records, config, file.firstRowNumber);
  const issues = runChecks(bars, config).sort(
    (a, b) => SEVERITY_ORDER.indexOf(SEVERITY[a.kind]) - SEVERITY_ORDER.indexOf(SEVERITY[b.kind]) || a.timestamp - b.timestamp,
  );
  const cleanBars = clean(bars);
  const vwap = rollingVwap(cleanBars, config.vwapWindowMinutes);
  // Bars with errors are kept only for the "Exclude bars with errors" toggle. Most files have none,
  // so the extra copy is only made when there's something different to show (it can be hundreds of MB).
  const hasErrorBars = issues.some((i) => SEVERITY[i.kind] === 'error');
  const barsWithErrors = hasErrorBars ? clean(bars, { keepErrorBars: true }) : cleanBars;

  // Start every issue kind at zero so the dashboard can show "0 duplicates" rather than leaving it out.
  const issueCounts = Object.fromEntries(Object.keys(SEVERITY).map((kind) => [kind, 0])) as Record<IssueKind, number>;
  for (const issue of issues) issueCounts[issue.kind]++;

  const dates = cleanBars.map((b) => b.tradingDate).sort();
  const summary: LoadSummary = {
    fileName,
    totalRows: records.length,
    acceptedRows: bars.length,
    rejectedRows: rejected.length,
    cleanRows: cleanBars.length,
    contracts: [...new Set(cleanBars.map((b) => b.contract))].sort(),
    dateRange: dates.length > 0 ? { from: dates[0] ?? '', to: dates.at(-1) ?? '' } : null,
    issueCounts,
    byContract: contractHealth(bars, cleanBars, issues),
    priceDecimals: priceDecimals(cleanBars),
  };

  return {
    summary,
    // Insights only need each contract's bar count, not the bars themselves.
    insights: generateInsights({ barsPerContract: new Map(summary.byContract.map((c) => [c.contract, c.bars])), rejected, issues, config }),
    rejected,
    issues,
    cleanBars,
    vwap,
    barsWithErrors,
    vwapWithErrors: hasErrorBars ? rollingVwap(barsWithErrors, config.vwapWindowMinutes) : vwap,
    config,
  };
}

export function query(dataset: Dataset, filter: Filter, view: ViewOptions = {}): QueryResult {
  const { config } = dataset;
  const chartContract = filter.contracts[0] ?? dataset.summary.contracts[0] ?? null;

  // "Exclude bars with errors" is on unless the user turned it off.
  const excludeErrors = filter.excludeErrors ?? true;
  const bars = excludeErrors ? dataset.cleanBars : dataset.barsWithErrors;
  const allPoints = excludeErrors ? dataset.vwap : dataset.vwapWithErrors;

  const daily = dailyBars(bars.filter((b) => matchesFilter(filter, b.contract, b.tradingDate)));

  // Chart, minute data: show a single day unless the user set a date range. A 15-minute VWAP is an intraday measure,
  // and months of minute data squeezed into one chart would hide it completely.
  // Chart, daily data: show every day, because a single day would be just one point.
  const contractPoints = allPoints.filter((p) => p.contract === chartContract && matchesFilter(filter, p.contract, p.tradingDate));
  // Judged on the contract's whole, cleaned history, so neither a narrow date filter nor a kept duplicate
  // (with "Exclude bars with errors" off) can make daily data look intraday or the other way round.
  const barInterval = detectBarInterval(dataset.vwap.filter((p) => p.contract === chartContract));
  const { day, mode } = barInterval === 'daily' ? wholeHistory(filter) : chooseChartDay(contractPoints, filter, view);
  const vwap = day ? contractPoints.filter((p) => p.tradingDate === day) : contractPoints;
  const first = vwap[0];
  const last = vwap.at(-1);

  // Issues per trading day for the chart contract, shown in the daily bars table.
  const issuesByDay: Record<string, number> = {};
  for (const issue of dataset.issues) {
    if (issue.contract !== chartContract) continue;
    const day = tradingDateFor(issue.timestamp, config.sessionBreak);
    issuesByDay[day] = (issuesByDay[day] ?? 0) + 1;
  }

  return {
    daily,
    chartContract,
    barInterval,
    chartRange: first && last ? { from: first.tradingDate, to: last.tradingDate, mode } : null,
    chartDays: [...new Set(contractPoints.map((p) => p.tradingDate))],
    vwap: downsample(vwap, config.maxChartPoints),
    chartPriceDecimals: (chartContract ? dataset.summary.priceDecimals[chartContract] : undefined) ?? 2,
    issuesByDay,
  };
}

/** Daily data has at most one bar per trading day; anything with more is intraday (e.g. minute bars). */
function detectBarInterval(points: readonly VwapPoint[]): BarInterval {
  const days = new Set(points.map((p) => p.tradingDate));
  return points.length > 0 && days.size === points.length ? 'daily' : 'intraday';
}

/** Daily data: the whole file, or the user's date range if they set one. Stepping day by day doesn't apply. */
function wholeHistory(filter: Filter): { day: undefined; mode: ChartMode } {
  return { day: undefined, mode: filter.from || filter.to ? 'filtered' : 'whole_history' };
}

/** At least this many one-minute bars (an hour of trading) for a day to be worth charting by default. */
const MIN_BARS_FOR_DEFAULT_DAY = 60;

/**
 * Decides which single day (if any) the chart shows, in order of priority:
 * a day the user stepped to, then the user's own date range (no single day), then the default day.
 */
function chooseChartDay(points: readonly VwapPoint[], filter: Filter, view: ViewOptions): { day: string | undefined; mode: ChartMode } {
  if (view.chartDay && points.some((p) => p.tradingDate === view.chartDay)) return { day: view.chartDay, mode: 'chosen_day' };
  if (filter.from || filter.to) return { day: undefined, mode: 'filtered' };
  return defaultChartDay(points);
}

/**
 * Picks the day the chart opens on: the latest day with at least an hour of trading.
 * The very latest day can be almost empty (e.g. a contract in its final days, or daily data), so it's only the fallback.
 */
function defaultChartDay(points: readonly VwapPoint[]): { day: string | undefined; mode: ChartMode } {
  const barsPerDay = new Map<string, number>();
  for (const p of points) barsPerDay.set(p.tradingDate, (barsPerDay.get(p.tradingDate) ?? 0) + 1);
  const days = [...barsPerDay.keys()].sort();
  const latestActive = days.filter((d) => (barsPerDay.get(d) ?? 0) >= MIN_BARS_FOR_DEFAULT_DAY).at(-1);
  return latestActive ? { day: latestActive, mode: 'latest_active_day' } : { day: days.at(-1), mode: 'latest_day' };
}
