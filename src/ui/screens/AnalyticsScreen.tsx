import type { ViewOptions } from '../../application/analyse';
import type { Filter } from '../../domain/types';
import { DailyBarsTable } from '../components/DailyBarsTable';
import { DailyCandleChart } from '../components/DailyCandleChart';
import { PriceVwapChart } from '../components/PriceVwapChart';
import type { ReadyState } from '../useAnalysis';

interface Props {
  readonly state: ReadyState;
  readonly onFilter: (filter: Filter) => void;
  readonly onView: (view: ViewOptions) => void;
}

/** Market view for one contract: filters, daily candles, close vs rolling VWAP for a day, and the daily bars table. */
export function AnalyticsScreen({ state, onFilter, onView }: Props) {
  const { filter, view, result, report } = state;
  const contract = filter.contracts[0] ?? '';
  const contractInfo = report.contracts.find((c) => c.contract === contract);
  // Only the startup sample has separate minute files; an uploaded file is analysed exactly as it is.
  const minuteMissing = state.origin === 'startup' && contract !== '' && !state.minuteContracts.includes(contract);
  const isDaily = result?.barInterval === 'daily';
  // The day the VWAP chart shows: the one the user picked, or the single day the app chose by default.
  const vwapDay = view.chartDay ?? (result?.chartRange && result.chartRange.from === result.chartRange.to ? result.chartRange.from : '');

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Analytics</h1>
        {state.pending && <span className="muted">Loading {contract}…</span>}
      </div>

      <div className="filter-bar">
        <label className="field">
          Contract
          <select
            value={contract}
            // A new contract has different dates, so the date range is cleared.
            onChange={(e) => onFilter({ contracts: [e.target.value], excludeErrors: filter.excludeErrors })}
          >
            {report.contracts.map((c) => (
              <option key={c.contract} value={c.contract}>
                {c.contract}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input
            type="date"
            value={filter.from ?? ''}
            min={contractInfo?.firstDate}
            max={contractInfo?.lastDate}
            onChange={(e) => onFilter({ ...filter, from: e.target.value || undefined })}
          />
        </label>
        <label className="field">
          To
          <input
            type="date"
            value={filter.to ?? ''}
            min={contractInfo?.firstDate}
            max={contractInfo?.lastDate}
            onChange={(e) => onFilter({ ...filter, to: e.target.value || undefined })}
          />
        </label>
        <label className="field">
          VWAP day
          <select value={vwapDay} disabled={isDaily || !result} onChange={(e) => onView({ chartDay: e.target.value || undefined })}>
            {vwapDay === '' && <option value="">{isDaily ? 'Daily data' : 'Whole range'}</option>}
            {[...(result?.chartDays ?? [])].reverse().map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={filter.excludeErrors ?? true}
            onChange={(e) => onFilter({ ...filter, excludeErrors: e.target.checked })}
          />
          Exclude bars with errors
        </label>
      </div>

      {minuteMissing && (
        <p className="muted small">
          Minute data for {contract} isn't downloaded, so these are daily bars. Run <code>npm run download-dataset</code> for
          intraday VWAP.
        </p>
      )}

      {!result ? (
        <p className="status-message">Loading {contract}…</p>
      ) : (
        <>
          <div className={`grid grid-2${state.pending ? ' is-pending' : ''}`}>
            <DailyCandleChart bars={result.daily} priceDecimals={result.chartPriceDecimals} />
            <PriceVwapChart result={result} />
          </div>
          <div className={state.pending ? 'is-pending' : undefined}>
            <DailyBarsTable bars={result.daily} priceDecimals={result.chartPriceDecimals} issuesByDay={result.issuesByDay} />
          </div>
        </>
      )}
    </>
  );
}
