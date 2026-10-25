import { DEFAULT_CONFIG } from '../domain/config';
import { ContractHealthTable } from './components/ContractHealthTable';
import { DailyBarsTable } from './components/DailyBarsTable';
import { FileUpload } from './components/FileUpload';
import { Filters } from './components/Filters';
import { HealthBanner } from './components/HealthBanner';
import { InsightsPanel } from './components/InsightsPanel';
import { PriceVwapChart } from './components/PriceVwapChart';
import { QualityIssuesTable } from './components/QualityIssuesTable';
import { RejectedRowsTable } from './components/RejectedRowsTable';
import { SummaryCards } from './components/SummaryCards';
import { useAnalysis } from './useAnalysis';

/** Page layout only: decides which sections to show for the current state. */
export function App() {
  const { state, loadFile, setFilter, setView } = useAnalysis();
  const hasData = state.status === 'ready';

  return (
    <>
      <header className="app-bar">
        <div className="app-bar-inner">
          <div>
            <h1>Futures Data Analyser</h1>
            <p className="subtitle">Market data quality and analytics</p>
          </div>
          {hasData ? (
            <nav className="section-nav" aria-label="Sections">
              <a href="#data-health">Data health</a>
              <a href="#market-view">Market view</a>
              <a href="#issue-log">Issue log</a>
            </nav>
          ) : (
            <span className="privacy-note">Files stay on your computer</span>
          )}
        </div>
      </header>

      <main>
        <FileUpload variant={hasData ? 'compact' : 'hero'} onFile={loadFile} disabled={state.status === 'loading'} />

        {state.status === 'loading' && <p className="status-message">Analysing {state.fileName}…</p>}
        {state.status === 'error' && (
          <p className="status-message error-message" role="alert">
            {state.message}
          </p>
        )}

        {state.status === 'ready' && (
          <>
            <section className="section" id="data-health">
              <h2 className="section-title">Data health</h2>
              <HealthBanner summary={state.summary} />
              <SummaryCards summary={state.summary} />
              <ContractHealthTable rows={state.summary.byContract} />
              <InsightsPanel insights={state.insights} />
            </section>

            <section className="section" id="market-view">
              <h2 className="section-title">Market view</h2>
              <Filters summary={state.summary} filter={state.filter} onChange={setFilter} />
              {state.result ? (
                <>
                  <PriceVwapChart
                    result={state.result}
                    windowMinutes={DEFAULT_CONFIG.vwapWindowMinutes}
                    pickedContract={state.filter.contracts.length > 0 || state.summary.contracts.length === 1}
                    onChartDay={(chartDay) => setView({ ...state.view, chartDay })}
                    priceDecimals={state.summary.priceDecimals[state.result.chartContract ?? ''] ?? 2}
                  />
                  <DailyBarsTable bars={state.result.daily} priceDecimals={state.summary.priceDecimals} />
                </>
              ) : (
                <p className="status-message">Preparing charts…</p>
              )}
            </section>

            <section className="section" id="issue-log">
              <h2 className="section-title">Issue log</h2>
              {state.result && (
                <QualityIssuesTable
                  issues={state.result.issues}
                  total={state.result.totalIssues}
                  countsByKind={state.result.issueCountsInView}
                  selectedKind={state.view.issueKind}
                  onSelectKind={(issueKind) => setView({ ...state.view, issueKind })}
                />
              )}
              <RejectedRowsTable rows={state.rejected} total={state.summary.rejectedRows} />
            </section>
          </>
        )}
      </main>
    </>
  );
}
