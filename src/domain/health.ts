import { SEVERITY } from './config';
import type { Bar, ContractHealth, IssueKind, LoadSummary, QualityIssue, Severity } from './types';

/**
 * Answers the first question a business user has: "can I use this data?"
 *
 * The rules:
 * - poor ("needs attention"): less than 95% of rows are usable.
 * - caveats ("usable with caveats"): mostly usable, but there are errors or warnings to be aware of.
 * - good: no errors or warnings. Information-only findings (e.g. settlement prices) don't count against the data.
 */

export type HealthLevel = 'good' | 'caveats' | 'poor';

export interface HealthVerdict {
  readonly level: HealthLevel;
  readonly headline: string;
  readonly usableShare: number; // 0..1
  readonly errors: number; // rejected rows + error-level issues
  readonly warnings: number;
}

/** Below this share of usable rows, the data needs cleansing before anyone relies on it. */
const MIN_USABLE_SHARE = 0.95;

const countBySeverity = (counts: Readonly<Record<IssueKind, number>>, severity: Severity): number =>
  (Object.keys(counts) as IssueKind[]).filter((kind) => SEVERITY[kind] === severity).reduce((sum, kind) => sum + counts[kind], 0);

export function assessHealth(summary: LoadSummary): HealthVerdict {
  const usableShare = summary.totalRows > 0 ? summary.cleanRows / summary.totalRows : 0;
  const errors = summary.rejectedRows + countBySeverity(summary.issueCounts, 'error');
  const warnings = countBySeverity(summary.issueCounts, 'warning');

  const usable = `${(usableShare * 100).toFixed(1).replace(/\.0$/, '')}% of rows usable`;
  const counts = `${errors.toLocaleString()} error${errors === 1 ? '' : 's'}, ${warnings.toLocaleString()} warning${warnings === 1 ? '' : 's'}`;

  if (usableShare < MIN_USABLE_SHARE) {
    return { level: 'poor', headline: `Needs attention: only ${usable}, ${counts}. Review the insights before using this data.`, usableShare, errors, warnings };
  }
  if (errors > 0 || warnings > 0) {
    return { level: 'caveats', headline: `Usable with caveats: ${usable}, ${counts}. See the insights for what they mean.`, usableShare, errors, warnings };
  }
  return { level: 'good', headline: `Good to use: ${usable}, no errors or warnings found.`, usableShare, errors, warnings };
}

/** Per-contract counts, sorted by contract. `bars` are all readable bars; `cleanBars` are those left after cleaning. */
export function contractHealth(bars: readonly Bar[], cleanBars: readonly Bar[], issues: readonly QualityIssue[]): ContractHealth[] {
  type Row = { contract: string; firstDate: string; lastDate: string; bars: number; usableBars: number; errors: number; warnings: number; info: number };
  const rows = new Map<string, Row>();
  const row = (contract: string) => {
    const existing = rows.get(contract);
    if (existing) return existing;
    const created: Row = { contract, firstDate: '', lastDate: '', bars: 0, usableBars: 0, errors: 0, warnings: 0, info: 0 };
    rows.set(contract, created);
    return created;
  };

  for (const b of bars) {
    const target = row(b.contract);
    target.bars++;
    // "YYYY-MM-DD" strings sort the same way as the dates they stand for, so plain comparison works.
    if (target.firstDate === '' || b.tradingDate < target.firstDate) target.firstDate = b.tradingDate;
    if (b.tradingDate > target.lastDate) target.lastDate = b.tradingDate;
  }
  for (const b of cleanBars) row(b.contract).usableBars++;
  for (const issue of issues) {
    const severity = SEVERITY[issue.kind];
    const target = row(issue.contract);
    if (severity === 'error') target.errors++;
    else if (severity === 'warning') target.warnings++;
    else target.info++;
  }
  return [...rows.values()].sort((a, b) => a.contract.localeCompare(b.contract));
}
