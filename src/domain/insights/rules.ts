import { REASON_LABELS, SEVERITY } from '../config';
import { hourOfDay } from '../time';
import type { AnalysisConfig, Insight, QualityIssue, RejectedRow, RejectReason, Severity } from '../types';

/**
 * Rule-based "intelligent insights".
 * Each rule looks at the full set of quality issues, spots a recurring pattern, and explains it in business terms
 * with a suggested cleansing or validation rule. Rules are plain functions; to add one, write it and add it to `rules`.
 */

export interface InsightContext {
  readonly barsPerContract: ReadonlyMap<string, number>; // how many accepted bars each contract has, before cleaning
  readonly rejected: readonly RejectedRow[];
  readonly issues: readonly QualityIssue[];
  readonly config: AnalysisConfig;
}

type InsightRule = (ctx: InsightContext) => Insight[];

/** Fewer gaps than this and a "time of day" pattern would just be noise. */
const MIN_GAPS_FOR_PATTERN = 10;
/** If one hour of the day holds at least this share of a contract's gaps, we call it a cluster. */
const CLUSTER_SHARE = 0.3;
/** If at least this share of a contract's bars are flat with zero volume, it's probably settlement-style data. */
const SETTLEMENT_SHARE = 0.2;
/** If at least this share of price jumps come right after a gap, the jumps are probably caused by the missing data. */
const JUMP_AFTER_GAP_SHARE = 0.5;

// ---------- small helpers ----------

const pct = (share: number): string => `${Math.round(share * 100)}%`;
const plural = (count: number, word: string): string => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;

/** Counts items by a key, e.g. issues by contract. */
function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function ofKind<K extends QualityIssue['kind']>(issues: readonly QualityIssue[], kind: K): Extract<QualityIssue, { kind: K }>[] {
  return issues.filter((i): i is Extract<QualityIssue, { kind: K }> => i.kind === kind);
}

// ---------- rules ----------

const REJECT_ADVICE: Readonly<Record<RejectReason, { title: string; rule: string }>> = {
  missing_contract: { title: 'with no contract symbol', rule: 'Make the contract column mandatory at source and reject rows without it.' },
  bad_timestamp: { title: 'with an unreadable timestamp', rule: 'Require ISO-8601 timestamps (YYYY-MM-DD HH:MM:SS) and state the timezone in the feed spec.' },
  missing_price: { title: 'missing an open, high, low or close price', rule: 'Make all four OHLC prices mandatory; reject or quarantine incomplete bars at ingestion.' },
  non_numeric_price: { title: 'with text where a price should be', rule: 'Validate price fields as numbers at source; reject rows that fail the type check.' },
};

const rejectedRows: InsightRule = ({ rejected }) =>
  [...countBy(rejected, (r) => r.reason)].map(([reason, count]) => {
    const advice = REJECT_ADVICE[reason as RejectReason];
    return {
      id: `rejected-${reason}`,
      title: `${plural(count, 'row')} ${advice.title}`,
      detail: `These rows were excluded from all analytics. First affected row: ${rejected.find((r) => r.reason === reason)?.sourceRow}.`,
      suggestedRule: advice.rule,
      severity: 'error',
      evidence: { kind: 'rejected_row', count, share: count / rejected.length },
    };
  });

const duplicates: InsightRule = ({ issues }) => {
  const conflicts = ofKind(issues, 'duplicate_conflict').length;
  const exact = ofKind(issues, 'duplicate_exact').length;
  const insights: Insight[] = [];
  if (conflicts > 0)
    insights.push({
      id: 'duplicate_conflict',
      title: `${plural(conflicts, 'timestamp')} sent twice with different values`,
      detail: 'The same contract and minute arrived more than once with different prices or volume. This often means the source sends corrections without marking them. The first row was kept.',
      suggestedRule: 'Enforce a unique (contract, timestamp) key. Ask the provider to flag corrections, then keep the latest revision.',
      severity: SEVERITY.duplicate_conflict,
      evidence: { kind: 'duplicate_conflict', count: conflicts, share: conflicts / (conflicts + exact) },
    });
  if (exact > 0)
    insights.push({
      id: 'duplicate_exact',
      title: `${plural(exact, 'exact duplicate row')}`,
      detail: 'Identical rows usually mean a file was loaded or sent twice. They were removed before analytics.',
      suggestedRule: 'De-duplicate on (contract, timestamp) at ingestion so re-loading a file is harmless.',
      severity: SEVERITY.duplicate_exact,
      evidence: { kind: 'duplicate_exact', count: exact, share: exact / (conflicts + exact) },
    });
  return insights;
};

const PRICE_ADVICE: Readonly<Record<Extract<QualityIssue, { kind: 'invalid_price' }>['reason'], { rule: string }>> = {
  non_positive: { rule: 'Reject prices of zero or below (unless the product can genuinely trade negative, e.g. some energy spreads).' },
  high_below_low: { rule: 'Reject bars where high < low; this usually means the columns are swapped at source.' },
  open_outside_range: { rule: 'Require low <= open <= high on every bar.' },
  close_outside_range: { rule: 'Require low <= close <= high on every bar.' },
};

const invalidPrices: InsightRule = ({ issues }) => {
  const found = ofKind(issues, 'invalid_price');
  return [...countBy(found, (i) => i.reason)].map(([reason, count]) => ({
    id: `invalid_price-${reason}`,
    title: `${plural(count, 'bar')} with an impossible price: ${REASON_LABELS[reason as keyof typeof PRICE_ADVICE]}`,
    detail: 'These bars were excluded from daily bars and VWAP, but remain listed in the quality report.',
    suggestedRule: PRICE_ADVICE[reason as keyof typeof PRICE_ADVICE].rule,
    severity: SEVERITY.invalid_price,
    evidence: { kind: 'invalid_price', count, share: count / found.length },
  }));
};

const VOLUME_ADVICE: Readonly<Record<Extract<QualityIssue, { kind: 'invalid_volume' }>['reason'], { effect: string; rule: string }>> = {
  missing: {
    effect: 'Prices on these bars are still used; their volume counts as zero in VWAP and daily totals.',
    rule: 'Make volume mandatory, or have the source send 0 explicitly when nothing traded.',
  },
  negative: {
    effect: 'Prices on these bars are still used; their volume was blanked so it counts as zero in VWAP and daily totals.',
    rule: 'Reject negative volume at ingestion.',
  },
  non_integer: {
    effect: 'The volume was kept as reported and is used in VWAP and daily totals.',
    rule: 'Futures trade in whole contracts; check whether the source is sending notional or averaged volume.',
  },
};

const invalidVolumes: InsightRule = ({ issues }) => {
  const found = ofKind(issues, 'invalid_volume');
  return [...countBy(found, (i) => i.reason)].map(([reason, count]) => ({
    id: `invalid_volume-${reason}`,
    title: `${plural(count, 'bar')} with ${REASON_LABELS[reason as keyof typeof VOLUME_ADVICE]}`,
    detail: VOLUME_ADVICE[reason as keyof typeof VOLUME_ADVICE].effect,
    suggestedRule: VOLUME_ADVICE[reason as keyof typeof VOLUME_ADVICE].rule,
    severity: SEVERITY.invalid_volume,
    evidence: { kind: 'invalid_volume', count, share: count / found.length },
  }));
};

const outOfOrder: InsightRule = ({ issues }) => {
  const count = ofKind(issues, 'out_of_order').length;
  if (count === 0) return [];
  return [
    {
      id: 'out_of_order',
      title: `${plural(count, 'row')} arrived out of time order`,
      detail: 'Rows were sorted before analytics. Out-of-order rows can mean late corrections or files concatenated in the wrong order.',
      suggestedRule: 'Sort by (contract, timestamp) on ingestion and alert when late rows arrive for a period already published.',
      severity: SEVERITY.out_of_order,
      evidence: { kind: 'out_of_order', count, share: 1 },
    },
  ];
};

/**
 * Gaps, per contract. Looks for three patterns:
 * - daily data with missing weekdays (most likely exchange holidays);
 * - intraday gaps clustered at one hour of the day (a session schedule we don't know about, or a recurring feed problem);
 * - intraday gaps spread evenly across the day (thin trading: minutes where nothing traded, not lost data).
 */
const gaps: InsightRule = ({ issues, config }) => {
  const insights: Insight[] = [];
  const byContract = new Map<string, Extract<QualityIssue, { kind: 'gap' }>[]>();
  for (const g of ofKind(issues, 'gap')) {
    const group = byContract.get(g.contract);
    if (group) group.push(g);
    else byContract.set(g.contract, [g]);
  }

  for (const [contract, contractGaps] of byContract) {
    // Daily-data gaps are whole days starting at midnight; intraday gaps almost never are.
    const isDaily = contractGaps.every((g) => g.gapMinutes % (24 * 60) === 0 && hourOfDay(g.previousTimestamp) === 0);
    const count = contractGaps.length;

    if (isDaily) {
      insights.push({
        id: `gap-daily-${contract}`,
        title: `${contract}: ${plural(count, 'gap')} of missing weekdays`,
        detail: 'Isolated missing weekdays in daily data usually line up with exchange holidays rather than lost data.',
        suggestedRule: 'Add the exchange holiday calendar to validation so holidays are not reported as gaps.',
        severity: 'info',
        evidence: { kind: 'gap', contract, count, share: 1 },
      });
      continue;
    }

    if (count < MIN_GAPS_FOR_PATTERN) {
      insights.push({
        id: `gap-few-${contract}`,
        title: `${contract}: ${plural(count, 'gap')} in intraday data`,
        detail: `Stretches of more than ${config.gapThresholdMinutes} minutes of open-market time with no bars. Too few to show a pattern; check them individually.`,
        suggestedRule: 'Compare against a second data source for the same window before back-filling.',
        severity: SEVERITY.gap,
        evidence: { kind: 'gap', contract, count, share: 1 },
      });
      continue;
    }

    const [busiestHour, busiestCount] = [...countBy(contractGaps, (g) => String(hourOfDay(g.previousTimestamp)))].sort((a, b) => b[1] - a[1])[0] ?? ['0', 0];
    const share = busiestCount / count;
    const hour = `${busiestHour.padStart(2, '0')}:00`;

    insights.push(
      share >= CLUSTER_SHARE
        ? {
            id: `gap-cluster-${contract}`,
            title: `${contract}: ${pct(share)} of gaps start between ${hour} and ${busiestHour.padStart(2, '0')}:59 CT`,
            detail: `${plural(busiestCount, 'gap')} out of ${count.toLocaleString()} begin in the same hour. A recurring gap at a fixed time is usually a trading-session boundary for this product or a scheduled feed outage.`,
            suggestedRule: `Check the session schedule for ${contract}. If the market is closed then, add it to the session calendar so these stop being flagged; if not, raise it with the data provider.`,
            severity: SEVERITY.gap,
            evidence: { kind: 'gap', contract, count: busiestCount, share },
          }
        : {
            id: `gap-spread-${contract}`,
            title: `${contract}: ${plural(count, 'gap')} spread across the trading day`,
            detail: `No hour holds more than ${pct(share)} of the gaps. That pattern fits thin trading - minutes where no trades happened - rather than a feed outage.`,
            suggestedRule: `Treat quiet minutes as expected for ${contract}: raise its gap threshold, or carry the last price forward for analytics instead of alerting.`,
            severity: 'info',
            evidence: { kind: 'gap', contract, count, share },
          },
    );
  }
  return insights;
};

const settlementStyleBars: InsightRule = ({ barsPerContract, issues }) => {
  return [...countBy(ofKind(issues, 'no_range_zero_volume'), (i) => i.contract)]
    .map(([contract, count]) => ({ contract, count, share: count / (barsPerContract.get(contract) ?? count) }))
    .filter(({ share }) => share >= SETTLEMENT_SHARE)
    .map(({ contract, count, share }) => ({
      id: `no_range_zero_volume-${contract}`,
      title: `${contract}: ${pct(share)} of bars are flat with zero volume`,
      detail: 'Bars where open = high = low = close and nothing traded are typical of deferred or illiquid contracts publishing a settlement price.',
      suggestedRule: `Tag ${contract} as settlement-only for these periods and exclude zero-volume bars from volatility and outlier statistics.`,
      severity: SEVERITY.no_range_zero_volume,
      evidence: { kind: 'no_range_zero_volume' as const, contract, count, share },
    }));
};

const outliers: InsightRule = ({ issues, config }) => {
  const found = ofKind(issues, 'outlier');
  if (found.length === 0) return [];
  // A gap issue is recorded on the bar after the gap; an outlier on the bar after the jump. Same bar = jump straight after a gap.
  const gapBars = new Set(ofKind(issues, 'gap').map((g) => `${g.contract}|${g.timestamp}`));
  const afterGap = found.filter((o) => gapBars.has(`${o.contract}|${o.timestamp}`)).length;
  const share = afterGap / found.length;
  const mostlyAfterGaps = share >= JUMP_AFTER_GAP_SHARE;

  return [
    {
      id: 'outlier',
      title: `${plural(found.length, 'unusually large price move')}`,
      detail: mostlyAfterGaps
        ? `${pct(share)} of them happen right after a data gap, so the price "jump" is mostly catching up on missing bars rather than a bad tick.`
        : `Moves more than ${config.outlierK}x the contract's typical move. Most do not follow a gap, so check them against news events or a second source.`,
      suggestedRule: mostlyAfterGaps
        ? 'Fix the gaps first; measure price moves only between consecutive bars when testing for spikes.'
        : `Add a spike filter that holds back moves above ${config.outlierK}x the typical move for review before publishing.`,
      severity: SEVERITY.outlier,
      evidence: { kind: 'outlier', count: found.length, share: mostlyAfterGaps ? share : 1 },
    },
  ];
};

/** Every rule that runs. Add new rules here. */
const rules: readonly InsightRule[] = [rejectedRows, duplicates, invalidPrices, invalidVolumes, outOfOrder, gaps, settlementStyleBars, outliers];

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'info'];

/** Runs every rule and returns the insights, most serious first (then by how many rows are affected). */
export function generateInsights(ctx: InsightContext): Insight[] {
  return rules
    .flatMap((rule) => rule(ctx))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.evidence.count - a.evidence.count);
}
