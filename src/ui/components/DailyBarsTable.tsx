import type { DailyBar } from '../../domain/types';
import { formatDate, formatNumber, formatPrice } from '../format';

interface Props {
  readonly bars: readonly DailyBar[];
  readonly priceDecimals: Readonly<Record<string, number>>; // per contract, so each contract's prices line up
}

/** Daily OHLCV bars for the current filter, newest first. */
export function DailyBarsTable({ bars, priceDecimals }: Props) {
  const price = (contract: string, value: number) => formatPrice(value, priceDecimals[contract] ?? 2);
  const newestFirst = [...bars].reverse();
  return (
    <div className="panel">
      <h3 className="panel-title">Daily OHLCV bars ({bars.length})</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contract</th>
              <th>Trading date</th>
              <th className="num">Open</th>
              <th className="num">High</th>
              <th className="num">Low</th>
              <th className="num">Close</th>
              <th className="num">Volume</th>
              <th className="num">Bars</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((d) => (
              <tr key={`${d.contract}|${d.tradingDate}`}>
                <td>{d.contract}</td>
                <td>{formatDate(d.tradingDate)}</td>
                <td className="num">{price(d.contract, d.open)}</td>
                <td className="num">{price(d.contract, d.high)}</td>
                <td className="num">{price(d.contract, d.low)}</td>
                <td className="num">{price(d.contract, d.close)}</td>
                <td className="num">{formatNumber(d.volume)}</td>
                <td className="num">{formatNumber(d.barCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
