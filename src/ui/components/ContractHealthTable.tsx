import type { ContractHealth } from '../../domain/types';
import { formatNumber } from '../format';

/** Quality per contract, so users can see which contracts are fine and which need attention. Hidden for single-contract files. */
export function ContractHealthTable({ rows }: { readonly rows: readonly ContractHealth[] }) {
  if (rows.length < 2) return null;
  return (
    <div className="panel">
      <h3 className="panel-title">By contract</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contract</th>
              <th className="num">Usable rows</th>
              <th className="num">Errors</th>
              <th className="num">Warnings</th>
              <th className="num">Info</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.contract}>
                <td>{r.contract}</td>
                <td className="num">
                  {formatNumber(r.bars > 0 ? (r.usableBars / r.bars) * 100 : 0, 1)}% <span className="muted">({formatNumber(r.usableBars)} of {formatNumber(r.bars)})</span>
                </td>
                <td className={`num ${r.errors > 0 ? 'text-error' : ''}`}>{formatNumber(r.errors)}</td>
                <td className={`num ${r.warnings > 0 ? 'text-warning' : ''}`}>{formatNumber(r.warnings)}</td>
                <td className="num">{formatNumber(r.info)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
