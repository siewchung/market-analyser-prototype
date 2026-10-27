import type { ChangeEvent } from 'react';
import type { QualityReport } from '../../application/qualityReport';
import type { AnalysisState } from '../useAnalysis';
import type { Tab } from '../useHashTab';

interface Props {
  readonly tab: Tab;
  readonly state: AnalysisState;
  readonly onUpload: (fileName: string, bytes: ArrayBuffer) => void;
  readonly onReset: () => void;
}

const TAB_LABELS: readonly { readonly tab: Tab; readonly label: string }[] = [
  { tab: 'overview', label: 'Overview' },
  { tab: 'quality', label: 'Quality' },
  { tab: 'analytics', label: 'Analytics' },
];

/** "40 contracts, minute and daily data": a one-line description of what's loaded. */
function datasetLine(report: QualityReport): string {
  const { intraday, daily } = report.files;
  const kinds = intraday > 0 && daily > 0 ? 'minute and daily' : intraday > 0 ? 'minute' : 'daily';
  const count = report.contracts.length;
  return `${count} contract${count === 1 ? '' : 's'}, ${kinds} data`;
}

/** The bar across the top of every screen: app name, screen tabs, what data is loaded, and the upload button. */
export function AppHeader({ tab, state, onUpload, onReset }: Props) {
  const ready = state.status === 'ready' ? state : null;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again later
    if (!file) return;
    // Uploading never adds to the current data, it replaces it, so say so before doing it.
    if (!window.confirm('Uploading replaces the current dataset. Reset returns to the startup data. Continue?')) return;
    onUpload(file.name, await file.arrayBuffer());
  };

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <a className="brand" href="#overview">
          <svg className="brand-icon" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1" y="9" width="3" height="6" rx="0.5" />
            <rect x="6.5" y="5" width="3" height="10" rx="0.5" />
            <rect x="12" y="1" width="3" height="14" rx="0.5" />
          </svg>
          Futures DQ
        </a>

        <nav className="tabs" aria-label="Screens">
          {TAB_LABELS.map(({ tab: t, label }) => (
            <a key={t} href={`#${t}`} className="tab" aria-current={tab === t ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>

        <div className="header-status">
          {ready && (
            <>
              <span className="muted">{datasetLine(ready.report)}</span>
              <span className="origin">
                <span className={`dot ${ready.origin}`} aria-hidden="true" />
                {ready.origin === 'startup' ? 'Loaded at startup' : `Uploaded: ${ready.fileName ?? 'file'}`}
              </span>
              {ready.origin === 'uploaded' && (
                <button type="button" className="link-button" onClick={onReset} disabled={ready.pending}>
                  Reset to startup data
                </button>
              )}
            </>
          )}
          <label className={`button primary${ready ? '' : ' disabled'}`}>
            Upload files
            <input type="file" accept=".csv,.parquet" className="visually-hidden" onChange={handleFile} disabled={!ready || ready.pending} />
          </label>
        </div>
      </div>
    </header>
  );
}
