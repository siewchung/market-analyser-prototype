import { AppHeader } from './components/AppHeader';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { QualityScreen } from './screens/QualityScreen';
import { useAnalysis } from './useAnalysis';
import { useHashTab } from './useHashTab';

/** Page layout only: the header, then whichever screen the tab points at. */
export function App() {
  const { state, uploadFile, reset, setFilter, setView } = useAnalysis();
  const [tab, goTo] = useHashTab();

  return (
    <>
      <AppHeader tab={tab} state={state} onUpload={uploadFile} onReset={reset} />
      <main>
        {state.status === 'loading' && <p className="status-message">{state.message}</p>}
        {state.status === 'error' && (
          <p className="status-message error-message" role="alert">
            {state.message}
          </p>
        )}
        {state.status === 'ready' && (
          <>
            {state.error && (
              <p className="notice error-message" role="alert">
                {state.error}
              </p>
            )}
            {tab === 'overview' && (
              <OverviewScreen
                state={state}
                onOpenQuality={() => goTo('quality')}
                onOpenAnalytics={(contract) => {
                  setFilter({ contracts: [contract], excludeErrors: state.filter.excludeErrors });
                  goTo('analytics');
                }}
              />
            )}
            {tab === 'quality' && <QualityScreen report={state.report} />}
            {tab === 'analytics' && <AnalyticsScreen state={state} onFilter={setFilter} onView={setView} />}
          </>
        )}
      </main>
    </>
  );
}
