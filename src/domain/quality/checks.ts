import { groupByContract } from '../bars';
import { DAY_MS, MINUTE_MS, closedMinutesBetween } from '../time';
import type { AnalysisConfig, Bar, QualityIssue } from '../types';

/**
 * Data quality checks. Each check is a plain function: bars in, issues out.
 * Checks receive bars in the original file order (before any cleaning), so they can see duplicates and ordering problems.
 * To add a new check: write a function with the `QualityCheck` signature and add it to the `checks` list at the bottom.
 */
export type QualityCheck = (bars: readonly Bar[], config: AnalysisConfig) => QualityIssue[];

// ---------- shared helpers ----------

/** Sorts by time and keeps only the first bar seen at each timestamp. */
function sortedUnique(bars: readonly Bar[]): Bar[] {
  const seen = new Set<number>();
  return bars.filter((b) => !seen.has(b.timestamp) && seen.add(b.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? NaN) : ((sorted[mid - 1] ?? NaN) + (sorted[mid] ?? NaN)) / 2;
}

/** Returns why a bar's prices are impossible, or null if they're fine. Only the first problem found is reported. */
export function invalidPriceReason(b: Bar): Extract<QualityIssue, { kind: 'invalid_price' }>['reason'] | null {
  if ([b.open, b.high, b.low, b.close].some((p) => p <= 0)) return 'non_positive';
  if (b.high < b.low) return 'high_below_low';
  if (b.open < b.low || b.open > b.high) return 'open_outside_range';
  if (b.close < b.low || b.close > b.high) return 'close_outside_range';
  return null;
}

const issueAt = (b: Bar, sourceRows: readonly number[] = [b.sourceRow]) => ({
  contract: b.contract,
  timestamp: b.timestamp,
  sourceRows,
});

// ---------- the checks ----------

/** Same contract and timestamp more than once. Identical copies and copies with different values are reported separately. */
export const checkDuplicates: QualityCheck = (bars) => {
  const firstSeen = new Map<string, Bar>();
  const issues: QualityIssue[] = [];
  for (const b of bars) {
    const key = `${b.contract}|${b.timestamp}`;
    const original = firstSeen.get(key);
    if (!original) {
      firstSeen.set(key, b);
      continue;
    }
    const identical =
      original.open === b.open && original.high === b.high && original.low === b.low && original.close === b.close && original.volume === b.volume;
    issues.push({ kind: identical ? 'duplicate_exact' : 'duplicate_conflict', ...issueAt(b, [original.sourceRow, b.sourceRow]) });
  }
  return issues;
};

/** Prices that can't be real: zero/negative, high below low, or open/close outside the high-low range. */
export const checkInvalidPrices: QualityCheck = (bars) =>
  bars.flatMap((b) => {
    const reason = invalidPriceReason(b);
    return reason ? [{ kind: 'invalid_price' as const, reason, ...issueAt(b) }] : [];
  });

/** Volume that is missing, negative, or not a whole number of contracts. Zero is allowed. */
export const checkInvalidVolumes: QualityCheck = (bars) =>
  bars.flatMap((b) => {
    const reason = b.volume === null ? 'missing' : b.volume < 0 ? 'negative' : !Number.isInteger(b.volume) ? 'non_integer' : null;
    return reason ? [{ kind: 'invalid_volume' as const, reason, ...issueAt(b) }] : [];
  });

/** A row whose time is earlier than a row that came before it in the file (for the same contract). */
export const checkOutOfOrder: QualityCheck = (bars) => {
  const latestSoFar = new Map<string, number>();
  const issues: QualityIssue[] = [];
  for (const b of bars) {
    const latest = latestSoFar.get(b.contract);
    if (latest !== undefined && b.timestamp < latest) issues.push({ kind: 'out_of_order', ...issueAt(b) });
    else latestSoFar.set(b.contract, b.timestamp);
  }
  return issues;
};

/** Counts Monday-Friday dates strictly between two daily timestamps. */
function weekdaysBetween(from: number, to: number): number {
  let count = 0;
  for (let day = from + DAY_MS; day < to; day += DAY_MS) {
    const dayOfWeek = new Date(day).getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
  }
  return count;
}

/**
 * Missing data between consecutive bars.
 * - Intraday data: a gap is more than `gapThresholdMinutes` of open-market time with no bar.
 *   The daily maintenance break and weekends are not counted (see time.ts).
 * - Daily data (bars a day or more apart): a gap is one or more missing weekdays.
 * Each gap is reported on the bar that comes after it.
 */
export const checkGaps: QualityCheck = (bars, config) => {
  const issues: QualityIssue[] = [];
  for (const group of groupByContract(bars).values()) {
    const sorted = sortedUnique(group);
    const spacings = sorted.slice(1).map((b, i) => b.timestamp - (sorted[i]?.timestamp ?? b.timestamp));
    const isDaily = spacings.length > 0 && median(spacings) >= DAY_MS;

    sorted.forEach((current, i) => {
      const previous = sorted[i - 1];
      if (!previous) return;
      const gapMinutes = isDaily
        ? weekdaysBetween(previous.timestamp, current.timestamp) * 24 * 60
        : (current.timestamp - previous.timestamp) / MINUTE_MS - closedMinutesBetween(previous.timestamp, current.timestamp, config.sessionBreak);
      const isGap = isDaily ? gapMinutes > 0 : gapMinutes > config.gapThresholdMinutes;
      if (isGap) issues.push({ kind: 'gap', gapMinutes, previousTimestamp: previous.timestamp, ...issueAt(current) });
    });
  }
  return issues;
};

/** Fewer price moves than this and we don't have enough data to judge what "unusual" looks like. */
const MIN_PRICE_MOVES = 5;

/**
 * Close-to-close price moves that are far bigger than usual for that contract.
 * "Usual" = the median size of the moves where the price actually changed (scaled to be comparable to a standard deviation).
 * Why this baseline:
 * - Medians aren't thrown off by the outliers themselves.
 * - Flat bars are left out, because illiquid contracts are mostly flat and would push the baseline to zero.
 * - Futures prices move in fixed ticks, so most moves are exactly +/-1 tick; measuring from zero keeps the baseline at about one tick.
 */
export const checkOutliers: QualityCheck = (bars, config) => {
  const issues: QualityIssue[] = [];
  for (const group of groupByContract(bars).values()) {
    const sorted = sortedUnique(group.filter((b) => invalidPriceReason(b) === null));
    const moves = sorted.slice(1).map((b, i) => ({ bar: b, returnPct: (b.close / (sorted[i]?.close ?? b.close) - 1) * 100 }));
    const nonZero = moves.filter((m) => m.returnPct !== 0).map((m) => m.returnPct);
    if (nonZero.length < MIN_PRICE_MOVES) continue;

    const MAD_TO_STD_DEV = 1.4826; // standard scaling so a median-based spread is comparable to a standard deviation
    const typicalMove = median(nonZero.map(Math.abs)) * MAD_TO_STD_DEV;

    for (const m of moves) {
      const score = Math.abs(m.returnPct) / typicalMove;
      if (score > config.outlierK) issues.push({ kind: 'outlier', returnPct: m.returnPct, score, ...issueAt(m.bar) });
    }
  }
  return issues;
};

/** Flat bars (open = high = low = close) with zero volume. Usually settlement prices, so informational only. */
export const checkNoRangeZeroVolume: QualityCheck = (bars) =>
  bars
    .filter((b) => b.volume === 0 && b.open === b.high && b.high === b.low && b.low === b.close)
    .map((b) => ({ kind: 'no_range_zero_volume' as const, ...issueAt(b) }));

/** Every check that runs on upload. Add new checks here. */
export const checks: readonly QualityCheck[] = [
  checkDuplicates,
  checkInvalidPrices,
  checkInvalidVolumes,
  checkOutOfOrder,
  checkGaps,
  checkOutliers,
  checkNoRangeZeroVolume,
];

export const runChecks = (bars: readonly Bar[], config: AnalysisConfig): QualityIssue[] => checks.flatMap((check) => check(bars, config));
