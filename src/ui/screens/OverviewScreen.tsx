import type { ReportContract } from '../../application/qualityReport';
import type { BarInterval, Severity } from '../../domain/types';
import { formatNumber } from '../format';
import { usablePercent } from '../health';
import type { ReadyState } from '../useAnalysis';

interface Props {
  readonly state: ReadyState;
  readonly onOpenQuality: () => void;
  readonly onOpenAnalytics: (contract: string) => void;
}

const SEVERITY_LABELS: Readonly<Record<Severity, string>> = { error: 'Error', warning: 'Warning', info: 'Info' };
const INTERVAL_LABELS: Readonly<Record<BarInterval, string>> = { intraday: 'minute', daily: 'daily' };

/** How many insights the "What to fix first" card shows; the full list is on the Quality screen. */
const TOP_INSIGHTS = 2;

const issueTotal = (c: ReportContract): number => c.errors + c.warnings + c.info;

/** The landing screen: what's loaded, how healthy it is, what to fix first, and every contract. */
export function OverviewScreen({ state, onOpenQuality, onOpenAnalytics }: Props) {
  const { report } = state;
  const percent = usablePercent(report);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Overview</h1>
      </div>

      <div className="grid grid-2-1">
        <section className="card" aria-labelledby="active-dataset">
          <h2 className="card-title card-head" id="active-dataset">
            Active dataset
          </h2>
          <dl className="facts">
            <div>
              <dt>Origin</dt>
              <dd>{state.origin === 'startup' ? 'Committed sample' : 'Uploaded file'}</dd>
            </div>
            <div>
              <dt>Loaded</dt>
              <dd>{state.loadedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</dd>
            </div>
            <div>
              <dt>Files</dt>
              <dd>
                {report.files.intraday + report.files.daily} (minute {report.files.intraday}, daily {report.files.daily})
              </dd>
            </div>
            <div>
              <dt>Contracts</dt>
              <dd>
                {report.contracts.length} across {report.roots.length} root{report.roots.length === 1 ? '' : 's'}
              </dd>
            </div>
            <div>
              <dt>Date range</dt>
              <dd>{report.dateRange ? `${report.dateRange.from} to ${report.dateRange.to}` : 'No usable rows'}</dd>
            </div>
            <div>
              <dt>Records</dt>
              <dd>{formatNumber(report.totalRows)}</dd>
            </div>
          </dl>
          <p className="muted small">Uploading files replaces this dataset. Reset returns to it.</p>
        </section>

        <section className="card" aria-labelledby="data-health">
          <h2 className="card-title card-head" id="data-health">
            Data health
          </h2>
          <p className="health-value">{percent}%</p>
          <p className="muted small">of records usable for analytics</p>
          <div className="progress" role="img" aria-label={`${percent}% of records usable`}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <div className="severity-counts">
            {(['error', 'warning', 'info'] as const).map((severity) => (
              <span key={severity}>
                <span className={`pill ${severity}`}>{SEVERITY_LABELS[severity]}</span>
                <strong>{formatNumber(report.severityCounts[severity])}</strong>
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="fix-first">
        <div className="card-head">
          <h2 className="card-title" id="fix-first">
            What to fix first
          </h2>
          <button type="button" className="link-button" onClick={onOpenQuality}>
            Open quality report
          </button>
        </div>
        {report.insights.length === 0 ? (
          <p className="muted">No recurring data quality patterns found.</p>
        ) : (
          <ul className="fix-list">
            {report.insights.slice(0, TOP_INSIGHTS).map((insight) => (
              <li key={insight.id}>
                <strong>{insight.title}</strong>
                <span className="muted small">Suggested rule: {insight.suggestedRule}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="contracts">
        <h2 className="card-title card-head" id="contracts">
          Contracts
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Root</th>
                <th>Frequencies</th>
                <th>First bar</th>
                <th>Last bar</th>
                <th className="num">Bars</th>
                <th className="num">Issues</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {report.contracts.map((c) => (
                <tr key={c.contract}>
                  <td>{c.contract}</td>
                  <td>{c.root}</td>
                  <td className="nowrap">{c.intervals.map((i) => INTERVAL_LABELS[i]).join(', ')}</td>
                  <td className="nowrap">{c.firstDate}</td>
                  <td className="nowrap">{c.lastDate}</td>
                  {/* Minute bars when the contract has them; adding minute and daily rows together would mean nothing. */}
                  <td className="num">{formatNumber(c.barsByInterval.intraday > 0 ? c.barsByInterval.intraday : c.barsByInterval.daily)}</td>
                  <td className="num">{formatNumber(issueTotal(c))}</td>
                  <td className="num action">
                    <button type="button" className="link-button" onClick={() => onOpenAnalytics(c.contract)}>
                      Analytics
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
