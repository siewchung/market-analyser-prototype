import type { DailyBar } from '../../domain/types';
import { formatNumber, formatPrice } from '../format';

interface Props {
  readonly bars: readonly DailyBar[]; // oldest first
  readonly priceDecimals: number;
  readonly issuesByDay: Readonly<Record<string, number>>;
}

/** Daily OHLCV bars for the chosen contract and dates, newest first, with how many issues each day had. */
export function DailyBarsTable({ bars, priceDecimals, issuesByDay }: Props) {
  const price = (value: number) => formatPrice(value, priceDecimals);
  const newestFirst = [...bars].reverse();
  return (
    <section className="card" aria-labelledby="daily-bars">
      <h2 className="card-title card-head" id="daily-bars">
        Daily bars
      </h2>
      {bars.length === 0 ? (
        <p className="muted">No daily bars in the selected range.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date (Chicago)</th>
                <th className="num">Open</th>
                <th className="num">High</th>
                <th className="num">Low</th>
                <th className="num">Close</th>
                <th className="num">Volume</th>
                <th className="num">Bars</th>
                <th className="num">Issues</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((d) => (
                <tr key={`${d.contract}|${d.tradingDate}`}>
                  <td className="nowrap">{d.tradingDate}</td>
                  <td className="num">{price(d.open)}</td>
                  <td className="num">{price(d.high)}</td>
                  <td className="num">{price(d.low)}</td>
                  <td className="num">{price(d.close)}</td>
                  <td className="num">{formatNumber(d.volume)}</td>
                  <td className="num">{formatNumber(d.barCount)}</td>
                  <td className="num">{formatNumber(issuesByDay[d.tradingDate] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
