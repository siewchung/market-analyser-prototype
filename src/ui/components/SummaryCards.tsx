import { ISSUE_LABELS, SEVERITY } from '../../domain/config';
import type { IssueKind, LoadSummary } from '../../domain/types';
import { formatDate, formatNumber } from '../format';

/** Headline numbers: a "data overview" row, then one card per quality check with a clear OK / problem status. */
export function SummaryCards({ summary }: { readonly summary: LoadSummary }) {
  const usableShare = summary.totalRows > 0 ? summary.cleanRows / summary.totalRows : 0;
  const overview = [
    { label: 'Usable rows', value: `${formatNumber(usableShare * 100, 1)}%`, note: `${formatNumber(summary.cleanRows)} of ${formatNumber(summary.totalRows)}` },
    { label: 'Rejected rows', value: formatNumber(summary.rejectedRows), note: 'Could not be read' },
    { label: 'Contracts', value: formatNumber(summary.contracts.length), note: summary.contracts.slice(0, 3).join(', ') + (summary.contracts.length > 3 ? '…' : '') },
    { label: 'Date range', value: summary.dateRange ? formatDate(summary.dateRange.from) : '-', note: summary.dateRange ? `to ${formatDate(summary.dateRange.to)}` : '', small: true },
  ];

  return (
    <>
      <p className="file-meta">
        <strong>{summary.fileName}</strong> · all times in Chicago time (CT)
      </p>
      <div className="cards overview">
        {overview.map((card) => (
          <div key={card.label} className="card">
            <div className="card-label">{card.label}</div>
            <div className={`card-value ${card.small ? 'compact' : ''}`}>{card.value}</div>
            <div className="card-note">{card.note}</div>
          </div>
        ))}
      </div>

      <h3 className="subheading">Quality checks</h3>
      <p className="muted small">These always cover the whole file; the filters below don't change them.</p>
      <div className="cards checks">
        {(Object.entries(summary.issueCounts) as [IssueKind, number][]).map(([kind, count]) => {
          const status = count === 0 ? 'ok' : SEVERITY[kind];
          return (
            <div key={kind} className={`card check ${status}`}>
              <div className="card-label">{ISSUE_LABELS[kind]}</div>
              <div className="card-value">{formatNumber(count)}</div>
              <div className={`status ${status}`}>{count === 0 ? 'Passed' : SEVERITY[kind]}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
