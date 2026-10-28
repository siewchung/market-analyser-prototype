import { useState } from 'react';
import type { ReportIssue } from '../../application/qualityReport';
import { ISSUE_LABELS, SEVERITY } from '../../domain/config';
import type { Severity } from '../../domain/types';
import { formatNumber } from '../format';
import { describeIssue, formatIssueTime } from '../issueText';

type SeverityFilter = 'all' | Severity;

const FILTERS: readonly { readonly value: SeverityFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Errors' },
  { value: 'warning', label: 'Warnings' },
  { value: 'info', label: 'Info' },
];
const SEVERITY_LABELS: Readonly<Record<Severity, string>> = { error: 'Error', warning: 'Warning', info: 'Info' };

interface Props {
  readonly sample: readonly ReportIssue[]; // the report keeps a sample of each severity, not every issue
  readonly severityCounts: Readonly<Record<Severity, number>>; // the real totals
}

/** A sample of individual issues, filterable by severity, with the true totals so nobody mistakes the sample for all of it. */
export function IssueLog({ sample, severityCounts }: Props) {
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const rows = filter === 'all' ? sample : sample.filter((s) => SEVERITY[s.issue.kind] === filter);
  const total = filter === 'all' ? severityCounts.error + severityCounts.warning + severityCounts.info : severityCounts[filter];
  const which = filter === 'all' ? '' : ` ${SEVERITY_LABELS[filter].toLowerCase()}`;

  return (
    <section className="card" aria-labelledby="issue-log">
      <div className="card-head">
        <div className="filter-pills">
          <h2 className="card-title" id="issue-log" style={{ alignSelf: 'center', marginRight: 8 }}>
            Issue log
          </h2>
          {FILTERS.map(({ value, label }) => (
            <button key={value} type="button" className="pill-button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">No{which} issues found.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Type</th>
                <th>Contract</th>
                <th>Time (Chicago)</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ issue, interval }, index) => (
                <tr key={`${issue.contract}|${issue.kind}|${issue.timestamp}|${index}`}>
                  <td>
                    <span className={`pill ${SEVERITY[issue.kind]}`}>{SEVERITY_LABELS[SEVERITY[issue.kind]]}</span>
                  </td>
                  <td className="nowrap">{ISSUE_LABELS[issue.kind]}</td>
                  <td>{issue.contract}</td>
                  <td className="nowrap">{formatIssueTime(issue.timestamp, interval)}</td>
                  <td>{describeIssue(issue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small table-footer">
        Showing {formatNumber(rows.length)} of {formatNumber(total)}
        {which} issues.
      </p>
    </section>
  );
}
