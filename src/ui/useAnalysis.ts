import { useCallback, useEffect, useRef, useState } from 'react';
import type { Filter, Insight, LoadSummary, QueryResult, RejectedRow, ViewOptions } from '../domain/types';
import type { WorkerRequest, WorkerResponse } from '../infrastructure/worker/protocol';

/** Where the app is up to. Each state carries only the data that makes sense in that state. */
export type AnalysisState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly fileName: string }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'ready';
      readonly summary: LoadSummary;
      readonly insights: readonly Insight[];
      readonly rejected: readonly RejectedRow[];
      readonly filter: Filter;
      readonly view: ViewOptions;
      readonly result: QueryResult | null; // null until the first query comes back
    };

const ALL: Filter = { contracts: [] };

/**
 * Owns the background worker and turns its messages into React state.
 * Components call loadFile(), setFilter() and setView(); they never talk to the worker directly.
 */
export function useAnalysis(): {
  state: AnalysisState;
  loadFile: (fileName: string, bytes: ArrayBuffer) => void;
  setFilter: (filter: Filter) => void;
  setView: (view: ViewOptions) => void;
} {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const workerRef = useRef<Worker | null>(null);
  // The latest filter and view, kept outside React state so callbacks always send the current values.
  const current = useRef<{ filter: Filter; view: ViewOptions }>({ filter: ALL, view: {} });

  const send = useCallback((request: WorkerRequest, transfer: Transferable[] = []) => {
    workerRef.current?.postMessage(request, transfer);
  }, []);

  /** Records the new filter/view and asks the worker for matching results. */
  const requery = useCallback(
    (filter: Filter, view: ViewOptions) => {
      current.current = { filter, view };
      setState((previous) => (previous.status === 'ready' ? { ...previous, filter, view } : previous));
      send({ type: 'query', filter, view });
    },
    [send],
  );

  useEffect(() => {
    const worker = new Worker(new URL('../infrastructure/worker/analysis.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      switch (response.type) {
        case 'loaded':
          current.current = { filter: ALL, view: {} };
          setState({ status: 'ready', summary: response.summary, insights: response.insights, rejected: response.rejected, filter: ALL, view: {}, result: null });
          worker.postMessage({ type: 'query', filter: ALL, view: {} } satisfies WorkerRequest);
          return;
        case 'result':
          setState((previous) => (previous.status === 'ready' ? { ...previous, result: response.result } : previous));
          return;
        case 'error':
          setState({ status: 'error', message: response.message });
          return;
      }
    };
    worker.onerror = (event) => setState({ status: 'error', message: event.message || 'The analysis worker crashed.' });

    return () => worker.terminate();
  }, []);

  const loadFile = useCallback(
    (fileName: string, bytes: ArrayBuffer) => {
      setState({ status: 'loading', fileName });
      send({ type: 'load', fileName, bytes }, [bytes]); // hand the bytes over instead of copying them
    },
    [send],
  );

  // A new filter resets the chart to its default day (the chosen day may not be in the new range); the issue type choice is kept.
  const setFilter = useCallback((filter: Filter) => requery(filter, { issueKind: current.current.view.issueKind }), [requery]);
  const setView = useCallback((view: ViewOptions) => requery(current.current.filter, view), [requery]);

  return { state, loadFile, setFilter, setView };
}
