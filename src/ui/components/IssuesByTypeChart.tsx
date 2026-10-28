import { ISSUE_LABELS, SEVERITY } from '../../domain/config';
import type { IssueKind } from '../../domain/types';
import { formatNumber } from '../format';

/** One bar per kind of issue found, longest first, coloured by how serious that kind is. Plain HTML, so it's accessible. */
export function IssuesByTypeChart({ counts }: { readonly counts: Readonly<Record<IssueKind, number>> }) {
  const found = (Object.keys(counts) as IssueKind[]).filter((kind) => counts[kind] > 0).sort((a, b) => counts[b] - counts[a]);
  const max = Math.max(1, ...found.map((kind) => counts[kind]));
  return (
    <section className="card" aria-labelledby="issues-by-type">
      <h2 className="card-title card-head" id="issues-by-type">
        Issues by type
      </h2>
      {found.length === 0 ? (
        <p className="muted">No issues found.</p>
      ) : (
        <div className="type-bars">
          {found.map((kind) => (
            <div key={kind} style={{ display: 'contents' }}>
              <span>{ISSUE_LABELS[kind]}</span>
              <span className="type-bar" aria-hidden="true">
                {/* At least 1% wide, so a kind with very few issues next to a huge one is still visible. */}
                <span className={SEVERITY[kind]} style={{ width: `${Math.max(1, (counts[kind] / max) * 100)}%` }} />
              </span>
              <span className="type-count">{formatNumber(counts[kind])}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
