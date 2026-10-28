import { REASON_LABELS } from '../../domain/config';
import type { ReportRejected } from '../../application/qualityReport';
import type { RejectedRow } from '../../domain/types';
import { formatCell, sentenceCase } from '../format';

/** Shows a raw row as readable "Column: value" pairs, with empty cells highlighted (often the reason it was rejected). */
function RawCells({ raw }: { readonly raw: RejectedRow['raw'] }) {
  return (
    <div className="raw-cells">
      {Object.entries(raw).map(([column, value]) => {
        const text = formatCell(value);
        return (
          <span key={column} className="raw-cell">
            <span className="key">{column}:</span> <span className={text === '(empty)' ? 'empty' : ''}>{text}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Rows that couldn't be read at all, with the file, the reason and the original content. Hidden when there are none. */
export function RejectedRowsTable({ rows, total }: { readonly rows: readonly ReportRejected[]; readonly total: number }) {
  if (total === 0) return null;
  return (
    <section className="card" aria-labelledby="rejected-rows">
      <h2 className="card-title card-head" id="rejected-rows">
        Rejected rows ({total.toLocaleString()}{rows.length < total ? `, first ${rows.length} shown` : ''})
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Row in file</th>
              <th>Reason</th>
              <th>Original content</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ fileName, row }) => (
              <tr key={`${fileName}|${row.sourceRow}`}>
                <td>{fileName}</td>
                <td>{row.sourceRow}</td>
                <td>{sentenceCase(REASON_LABELS[row.reason])}</td>
                <td>
                  <RawCells raw={row.raw} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
