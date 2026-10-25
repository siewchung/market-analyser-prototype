import { assessHealth } from '../../domain/health';
import type { LoadSummary } from '../../domain/types';

const LEVEL_LABEL = { good: 'Good to use', caveats: 'Usable with caveats', poor: 'Needs attention' } as const;

/** One-line answer to "can I use this data?", coloured by how serious things are. */
export function HealthBanner({ summary }: { readonly summary: LoadSummary }) {
  const verdict = assessHealth(summary);
  return (
    <div className={`health-banner ${verdict.level}`} role="status">
      <span className="health-level">{LEVEL_LABEL[verdict.level]}</span>
      <span>{verdict.headline.replace(/^[^:]+:\s*/, '')}</span>
    </div>
  );
}
