import type { Filter, ViewOptions } from '../../domain/types';
import type { ReadyState } from '../useAnalysis';

interface Props {
  readonly state: ReadyState;
  readonly onFilter: (filter: Filter) => void;
  readonly onView: (view: ViewOptions) => void;
}

export function AnalyticsScreen(_props: Props) {
  return <h1 className="page-title">Analytics</h1>;
}
