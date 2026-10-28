import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DailyBar } from '../../domain/types';
import { candleGeometry } from '../charts/candle';
import { formatNumber, formatPrice } from '../format';

interface Props {
  readonly bars: readonly DailyBar[]; // oldest first
  readonly priceDecimals: number;
}

/** More candles than this become too thin to read, so only the most recent ones are drawn. */
const MAX_CANDLES = 60;

/** What Recharts passes to a custom bar shape. Only the fields used here are listed. */
interface ShapeProps {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly payload?: DailyBar;
}

/**
 * Draws one candle. Recharts has already placed a bar from the day's low to its high (x, y, width, height),
 * so prices can be turned into pixels from that bar alone.
 */
function Candle({ x = 0, y = 0, width = 0, height = 0, payload }: ShapeProps) {
  if (!payload) return null;
  const range = payload.high - payload.low;
  const yScale = (price: number) => (range === 0 ? y : y + ((payload.high - price) / range) * height);
  const g = candleGeometry(payload, yScale);
  const centre = x + width / 2;
  const bodyWidth = Math.max(3, width * 0.6);
  // Up days are hollow and green, down days are solid red, so they differ by fill as well as colour.
  const colour = g.direction === 'up' ? 'var(--good)' : 'var(--error)';
  return (
    <g>
      <line x1={centre} x2={centre} y1={g.wickTop} y2={g.wickBottom} stroke={colour} strokeWidth={1.5} />
      <rect
        x={centre - bodyWidth / 2}
        y={g.bodyTop}
        width={bodyWidth}
        height={g.bodyBottom - g.bodyTop}
        fill={g.direction === 'up' ? 'var(--card)' : colour}
        stroke={colour}
        strokeWidth={1.5}
      />
    </g>
  );
}

/** Daily open-high-low-close as candlesticks. */
export function DailyCandleChart({ bars, priceDecimals }: Props) {
  const shown = bars.slice(-MAX_CANDLES).map((b) => ({ ...b, range: [b.low, b.high] }));
  return (
    <section className="card" aria-labelledby="daily-ohlc">
      <h2 className="card-title card-head" id="daily-ohlc">
        Daily OHLC
      </h2>
      {bars.length > MAX_CANDLES && (
        <p className="muted small chart-note">
          Showing the latest {MAX_CANDLES} of {bars.length} days. Set From and To to see an earlier period.
        </p>
      )}
      {shown.length === 0 ? (
        <p className="chart-empty">No daily bars in the selected range.</p>
      ) : (
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            {/* Extra bottom margin leaves room for the horizontal axis title. */}
            <ComposedChart data={shown} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="tradingDate"
                minTickGap={24}
                stroke="var(--muted)"
                tick={{ fontSize: 12 }}
                label={{ value: 'Trading date (CME session)', position: 'insideBottom', offset: -16, fill: 'var(--muted)', fontSize: 12 }}
              />
              <YAxis
                domain={['auto', 'auto']}
                width={80}
                stroke="var(--muted)"
                tick={{ fontSize: 12 }}
                tickFormatter={(v: number) => formatNumber(v, Math.min(priceDecimals, 3))}
                label={{ value: 'Price', angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 12 }}
              />
              <Tooltip
                formatter={(_value, _name, item) => {
                  const d = item.payload as DailyBar;
                  const p = (v: number) => formatPrice(v, priceDecimals);
                  return [`O ${p(d.open)}  H ${p(d.high)}  L ${p(d.low)}  C ${p(d.close)}`, 'Price'];
                }}
              />
              <Bar dataKey="range" shape={(props: unknown) => <Candle {...(props as ShapeProps)} />} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
