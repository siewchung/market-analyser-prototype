import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { QueryResult } from '../../domain/types';
import { formatDateTime, formatNumber, formatPrice, formatShortDate, formatTime } from '../format';

interface Props {
  readonly result: QueryResult;
  readonly windowMinutes: number;
}

/**
 * Close price against the rolling VWAP for the chosen day.
 * Daily data has no intraday prices, so a VWAP over 15 minutes can't be drawn: the card explains that instead.
 */
export function PriceVwapChart({ result, windowMinutes }: Props) {
  const { chartRange, barInterval, vwap: points, chartPriceDecimals: decimals } = result;
  const singleDay = chartRange !== null && chartRange.from === chartRange.to;
  const tick = (t: number) => (singleDay ? formatTime(t) : formatShortDate(t));

  return (
    <section className="card" aria-labelledby="vwap-chart">
      <h2 className="card-title card-head" id="vwap-chart">
        Rolling {windowMinutes} minute VWAP
      </h2>
      {barInterval === 'daily' ? (
        <p className="chart-empty">
          VWAP needs intraday bars. This contract only has daily data here, with one bar per day, so a {windowMinutes}-minute
          VWAP would just repeat each day's price.
        </p>
      ) : points.length === 0 ? (
        <p className="chart-empty">No bars on the selected day.</p>
      ) : (
        <>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...points]} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} minTickGap={40} stroke="var(--muted)" tick={{ fontSize: 12 }} />
                <YAxis domain={['auto', 'auto']} width={64} stroke="var(--muted)" tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatNumber(v, Math.min(decimals, 3))} />
                <Tooltip labelFormatter={(t) => `${formatDateTime(Number(t))} CT`} formatter={(v) => (typeof v === 'number' ? formatPrice(v, decimals) : String(v))} />
                <Line dataKey="close" name="Close" stroke="var(--series-close)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line dataKey="vwap" name="VWAP" stroke="var(--series-vwap)" strokeWidth={2.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend" aria-hidden="true">
            <span>
              <span className="legend-line" />
              Close
            </span>
            <span>
              <span className="legend-line vwap" />
              VWAP
            </span>
          </div>
        </>
      )}
    </section>
  );
}
