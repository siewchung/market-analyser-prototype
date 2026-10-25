import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartMode, QueryResult } from '../../domain/types';
import { formatDate, formatDateTime, formatNumber, formatPrice, formatShortDate, formatTime } from '../format';

interface Props {
  readonly result: QueryResult;
  readonly windowMinutes: number;
  readonly pickedContract: boolean; // false when "All contracts" is selected and the chart fell back to the first one
  readonly onChartDay: (day: string | undefined) => void; // undefined = back to the default view
  readonly priceDecimals: number; // for the chart's contract
}

/** Explains to the user which dates the chart is showing and why. */
const CHART_NOTE: Readonly<Record<ChartMode, (from: string, to: string) => string>> = {
  latest_active_day: (day) => `Showing ${formatDate(day)}, the latest day with at least an hour of trading. Set From and To above to see another period.`,
  latest_day: (day) => `Showing the latest trading day, ${formatDate(day)}. Set From and To above to see another period.`,
  chosen_day: (day) => `Showing ${formatDate(day)}.`,
  filtered: (from, to) => `Showing ${from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`}.`,
};

/** Close price with the rolling VWAP overlaid, for one contract. Defaults to a single recent day. */
export function PriceVwapChart({ result, windowMinutes, pickedContract, onChartDay, priceDecimals }: Props) {
  const { chartContract, chartRange, chartDays, vwap: points } = result;
  // The nearest days with data either side of what's shown (skips weekends and gaps automatically).
  const previousDay = chartRange ? chartDays.filter((d) => d < chartRange.from).at(-1) : undefined;
  const nextDay = chartRange ? chartDays.find((d) => d > chartRange.to) : undefined;
  const singleDay = chartRange !== null && chartRange.from === chartRange.to;
  // One day: show times on the axis. Several days: show dates.
  const tick = (t: number) => (singleDay ? formatTime(t) : formatShortDate(t));

  return (
    <div className="panel">
      <h3 className="panel-title">
        {chartContract ?? 'Price'}: close vs rolling {windowMinutes}-minute VWAP
      </h3>
      {chartRange && (
        <div className="day-nav">
          <button className="button small-button" onClick={() => onChartDay(previousDay)} disabled={!previousDay}>
            ◀ Previous day
          </button>
          <button className="button small-button" onClick={() => onChartDay(nextDay)} disabled={!nextDay}>
            Next day ▶
          </button>
          {chartRange.mode === 'chosen_day' && (
            <button className="link-button" onClick={() => onChartDay(undefined)}>
              Back to default view
            </button>
          )}
        </div>
      )}
      {chartRange && (
        <p className="muted small chart-note">
          {CHART_NOTE[chartRange.mode](chartRange.from, chartRange.to)}
          {!pickedContract && ' The chart shows one contract at a time: choose a contract above to change it.'}
        </p>
      )}
      {points.length === 0 ? (
        <p className="muted">No bars in the selected range.</p>
      ) : (
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[...points]} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} minTickGap={40} stroke="var(--muted)" />
              <YAxis domain={['auto', 'auto']} width={70} tickFormatter={(v: number) => formatNumber(v, Math.min(priceDecimals, 3))} /* axis: no padded zeros */ stroke="var(--muted)" />
              <Tooltip labelFormatter={(t) => `${formatDateTime(Number(t))} CT`} formatter={(v) => (typeof v === 'number' ? formatPrice(v, priceDecimals) : String(v))} />
              <Legend />
              <Line dataKey="close" name="Close" stroke="var(--series-1)" dot={false} isAnimationActive={false} />
              <Line dataKey="vwap" name={`VWAP (${windowMinutes}m)`} stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
