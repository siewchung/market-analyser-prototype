import type { Filter, LoadSummary } from '../../domain/types';

interface Props {
  readonly summary: LoadSummary;
  readonly filter: Filter;
  readonly onChange: (filter: Filter) => void;
}

/**
 * Contract and date-range filters.
 * One contract at a time (or all) keeps it simple on mobile; the chart always shows a single contract.
 */
export function Filters({ summary, filter, onChange }: Props) {
  const range = summary.dateRange;
  return (
    <div className="panel filters">
      <label>
        Contract
        <select value={filter.contracts[0] ?? ''} onChange={(e) => onChange({ ...filter, contracts: e.target.value ? [e.target.value] : [] })}>
          <option value="">All contracts</option>
          {summary.contracts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        From
        <input type="date" value={filter.from ?? ''} min={range?.from} max={range?.to} onChange={(e) => onChange({ ...filter, from: e.target.value || undefined })} />
      </label>
      <label>
        To
        <input type="date" value={filter.to ?? ''} min={range?.from} max={range?.to} onChange={(e) => onChange({ ...filter, to: e.target.value || undefined })} />
      </label>
      <button className="button" onClick={() => onChange({ contracts: [] })}>
        Reset
      </button>
      <p className="muted small filter-note">Filters change the chart, daily bars and issue log.</p>
    </div>
  );
}
