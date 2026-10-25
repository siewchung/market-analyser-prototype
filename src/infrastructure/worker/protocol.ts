import type { Filter, Insight, LoadSummary, QueryResult, RejectedRow, ViewOptions } from '../../domain/types';

/**
 * The messages passed between the page and the background worker.
 * Each message has a `type`, so TypeScript can check that both sides handle every kind of message.
 */

/** Page -> worker. */
export type WorkerRequest =
  | { readonly type: 'load'; readonly fileName: string; readonly bytes: ArrayBuffer }
  | { readonly type: 'query'; readonly filter: Filter; readonly view: ViewOptions };

/** Worker -> page. */
export type WorkerResponse =
  | { readonly type: 'loaded'; readonly summary: LoadSummary; readonly insights: readonly Insight[]; readonly rejected: readonly RejectedRow[] }
  | { readonly type: 'result'; readonly result: QueryResult }
  | { readonly type: 'error'; readonly message: string };
