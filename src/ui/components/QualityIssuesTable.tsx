import { ISSUE_LABELS, REASON_LABELS, SEVERITY } from '../../domain/config';
import type { IssueKind, QualityIssue } from '../../domain/types';
import { formatDateTime, formatNumber, sentenceCase } from '../format';

/** The kind-specific detail for one issue, in plain words. */
function describe(issue: QualityIssue): string {
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

interface Props {
  readonly issues: readonly QualityIssue[];
  readonly total: number;
  readonly countsByKind: Readonly<Record<IssueKind, number>>;
  readonly selectedKind: IssueKind | undefined;
  readonly onSelectKind: (kind: IssueKind | undefined) => void;
}

/** Every quality issue for the current filter, most serious first (capped for performance). */
export function QualityIssuesTable({ issues, total, countsByKind, selectedKind, onSelectKind }: Props) {
  const allCount = Object.values(countsByKind).reduce((sum, n) => sum + n, 0);
  const kindsFound = (Object.keys(countsByKind) as IssueKind[]).filter((kind) => countsByKind[kind] > 0);
  return (
    <div className="panel">
      <h3 className="panel-title">Quality issues</h3>
      {kindsFound.length > 1 && (
        <div className="chips" role="group" aria-label="Show issue type">
          <button className={`chip ${selectedKind === undefined ? 'selected' : ''}`} aria-pressed={selectedKind === undefined} onClick={() => onSelectKind(undefined)}>
            All ({formatNumber(allCount)})
          </button>
          {kindsFound.map((kind) => (
            <button key={kind} className={`chip ${SEVERITY[kind]} ${selectedKind === kind ? 'selected' : ''}`} aria-pressed={selectedKind === kind} onClick={() => onSelectKind(kind)}>
              {ISSUE_LABELS[kind]} ({formatNumber(countsByKind[kind])})
            </button>
          ))}
        </div>
      )}
      <p className="muted">{total > issues.length ? `Showing the ${formatNumber(issues.length)} most serious of ${formatNumber(total)}.` : `${formatNumber(total)} found.`}</p>
      {issues.length > 0 && (
        <div className="table-wrap tall">
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Issue</th>
                <th>Contract</th>
                <th>Time (CT)</th>
                <th>Row in file</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, i) => (
                <tr key={i}>
                  <td>
                    <span className={`badge ${SEVERITY[issue.kind]}`}>{SEVERITY[issue.kind]}</span>
                  </td>
                  <td>{ISSUE_LABELS[issue.kind]}</td>
                  <td>{issue.contract}</td>
                  <td>{formatDateTime(issue.timestamp)}</td>
                  <td>{issue.sourceRows.join(', ')}</td>
                  <td>{describe(issue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
