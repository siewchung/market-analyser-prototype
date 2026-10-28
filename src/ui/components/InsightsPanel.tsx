import { useState } from 'react';
import type { Insight } from '../../domain/types';

/** How many insights to show before "Show all"; they're sorted most serious first, so the top ones matter most. */
const INITIAL_COUNT = 3;

/** The rule-based insights: the pattern found, and the cleansing or validation rule we suggest for it. */
export function InsightsPanel({ insights }: { readonly insights: readonly Insight[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? insights : insights.slice(0, INITIAL_COUNT);
  return (
    <section className="card" aria-labelledby="insights">
      <h2 className="card-title card-head" id="insights">
        Insights
      </h2>
      {insights.length === 0 ? (
        <p className="muted">No recurring data quality patterns found.</p>
      ) : (
        <ul className="fix-list">
          {visible.map((insight) => (
            <li key={insight.id}>
              <strong>{insight.title}</strong>
              <span className="muted small">Suggested rule: {insight.suggestedRule}</span>
            </li>
          ))}
        </ul>
      )}
      {insights.length > INITIAL_COUNT && (
        <button type="button" className="link-button" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${insights.length} insights`}
        </button>
      )}
    </section>
  );
}
