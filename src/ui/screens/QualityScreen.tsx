import { useState } from 'react';
import type { QualityReport } from '../../application/qualityReport';
import { InsightsPanel } from '../components/InsightsPanel';
import { IssueLog } from '../components/IssueLog';
import { IssuesByTypeChart } from '../components/IssuesByTypeChart';
import { RejectedRowsTable } from '../components/RejectedRowsTable';
import { formatNumber } from '../format';

/** The data quality report: headline counts, issues by type, insights, and the issue log. */
export function QualityScreen({ report }: { readonly report: QualityReport }) {
  const [showRejected, setShowRejected] = useState(false);
  const fileCount = report.files.intraday + report.files.daily;
  const acceptedPercent = report.totalRows > 0 ? ((report.acceptedRows / report.totalRows) * 100).toFixed(1) : '0.0';
  const issueTotal = report.severityCounts.error + report.severityCounts.warning + report.severityCounts.info;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Data quality report</h1>
      </div>

      <div className="grid grid-4">
        <div className="card">
          <p className="counter-label">Records read</p>
          <p className="counter-value">{formatNumber(report.totalRows)}</p>
          <p className="muted small">
            across {fileCount} file{fileCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="card">
          <p className="counter-label">Accepted</p>
          <p className="counter-value">{formatNumber(report.acceptedRows)}</p>
          <p className="muted small">{acceptedPercent}% of records</p>
        </div>
        {/* Clicking the Rejected card shows the rejected rows themselves, so nothing is hidden from the user. */}
        <button
          type="button"
          className="card counter-button"
          aria-expanded={showRejected}
          disabled={report.rejectedRows === 0}
          onClick={() => setShowRejected(!showRejected)}
        >
          <p className="counter-label">Rejected</p>
          <p className="counter-value">{formatNumber(report.rejectedRows)}</p>
          <p className="muted small">{report.rejectedRows === 0 ? 'unparseable rows' : showRejected ? 'hide the rows' : 'unparseable rows: show them'}</p>
        </button>
        <div className="card">
          <p className="counter-label">Issues found</p>
          <p className="counter-value">{formatNumber(issueTotal)}</p>
          <p className="muted small">
            {formatNumber(report.severityCounts.error)} errors, {formatNumber(report.severityCounts.warning)} warnings
          </p>
        </div>
      </div>

      {showRejected && <RejectedRowsTable rows={report.rejectedSample} total={report.rejectedRows} />}

      <div className="grid grid-3-2">
        <IssuesByTypeChart counts={report.issueCounts} />
        <InsightsPanel insights={report.insights} />
      </div>

      <IssueLog sample={report.issueSample} severityCounts={report.severityCounts} />
    </>
  );
}
