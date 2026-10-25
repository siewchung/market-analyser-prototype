import { useState } from 'react';
import type { Insight } from '../../domain/types';

/** How many insights to show before "Show all"; they're sorted most serious first, so the top ones matter most. */
const INITIAL_COUNT = 5;

/** The rule-based insights: what pattern was found, why it matters, and the suggested rule. */
export function InsightsPanel({ insights }: { readonly insights: readonly Insight[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? insights : insights.slice(0, INITIAL_COUNT);
  return (
    <div className="panel">
      <h3 className="panel-title">Insights &amp; suggested rules</h3>
      {insights.length === 0 ? (
        <p className="muted">No recurring data quality patterns found.</p>
      ) : (
        <ul className="insights">
          {visible.map((insight) => (
            <li key={insight.id} className={`insight ${insight.severity}`}>
              <div className="insight-head">
                <span className={`badge ${insight.severity}`}>{insight.severity}</span>
                <strong>{insight.title}</strong>
              </div>
              <p className="muted">{insight.detail}</p>
              <p className="rule">
                <span className="rule-label">Suggested rule</span>
                {insight.suggestedRule}
              </p>
            </li>
          ))}
        </ul>
      )}
      {insights.length > INITIAL_COUNT && (
        <button className="link-button show-all" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${insights.length} insights`}
        </button>
      )}
    </div>
  );
}
