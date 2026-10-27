import type { ReadyState } from '../useAnalysis';

interface Props {
  readonly state: ReadyState;
  readonly onOpenQuality: () => void;
  readonly onOpenAnalytics: (contract: string) => void;
}

export function OverviewScreen(_props: Props) {
  return <h1 className="page-title">Overview</h1>;
}
