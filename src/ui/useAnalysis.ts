import { useCallback, useEffect, useRef, useState } from 'react';
import type { QualityReport } from '../application/qualityReport';
import type { Filter, QueryResult, ViewOptions } from '../domain/types';
import type { DataOrigin, WorkerRequest, WorkerResponse } from '../infrastructure/worker/protocol';

/** Where the app is up to. Each state carries only the data that makes sense in that state. */
export type AnalysisState =
  | { readonly status: 'loading'; readonly message: string }
  | { readonly status: 'error'; readonly message: string } // nothing could be loaded at all
  | {
      readonly status: 'ready';
      readonly origin: DataOrigin;
      readonly fileName: string | null;
      readonly loadedAt: Date;
      readonly report: QualityReport;
      readonly minuteContracts: readonly string[];
      readonly filter: Filter;
      readonly view: ViewOptions;
      readonly result: QueryResult | null; // null until the first query comes back
      readonly pending: boolean; // true while the worker is working on the latest filter or view change
      readonly error: string | null; // e.g. an upload that couldn't be read; the previous data stays on screen
    };

export type ReadyState = Extract<AnalysisState, { status: 'ready' }>;

/**
 * Owns the background worker and turns its messages into React state.
 * Components call uploadFile(), reset(), setFilter() and setView(); they never talk to the worker directly.
 */
export function useAnalysis(): {
  state: AnalysisState;
  uploadFile: (fileName: string, bytes: ArrayBuffer) => void;
  reset: () => void;
  setFilter: (filter: Filter) => void;
  setView: (view: ViewOptions) => void;
} {
  const [state, setState] = useState<AnalysisState>({ status: 'loading', message: 'Loading the sample data…' });
  const workerRef = useRef<Worker | null>(null);
  // The latest filter and view, kept outside React state so callbacks always send the current values.
  const current = useRef<{ filter: Filter; view: ViewOptions }>({ filter: { contracts: [] }, view: {} });
  // Each query gets a number. Answers to older queries are ignored, so the screen never shows a contract the user has left.
  const latestQueryId = useRef(0);

  const send = useCallback((request: WorkerRequest, transfer: Transferable[] = []) => {
    workerRef.current?.postMessage(request, transfer);
  }, []);

  /** Records the new filter/view and asks the worker for matching results. */
  const requery = useCallback(
    (filter: Filter, view: ViewOptions) => {
      current.current = { filter, view };
      latestQueryId.current += 1;
      setState((previous) => (previous.status === 'ready' ? { ...previous, filter, view, pending: true } : previous));
      send({ type: 'query', queryId: latestQueryId.current, filter, view });
    },
    [send],
  );

  useEffect(() => {
    const worker = new Worker(new URL('../infrastructure/worker/analysis.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      switch (response.type) {
        case 'ready': {
          // Start Analytics on the first contract, with bars that have errors left out.
          const first = response.report.contracts[0]?.contract;
          const filter: Filter = { contracts: first ? [first] : [], excludeErrors: true };
          setState({
            status: 'ready',
            origin: response.origin,
            fileName: response.fileName,
            loadedAt: new Date(),
            report: response.report,
            minuteContracts: response.minuteContracts,
            filter,
            view: {},
            result: null,
            pending: true,
            error: null,
          });
          current.current = { filter, view: {} };
          latestQueryId.current += 1;
          worker.postMessage({ type: 'query', queryId: latestQueryId.current, filter, view: {} } satisfies WorkerRequest);
          return;
        }
        case 'result':
          if (response.queryId !== latestQueryId.current) return; // an answer to a query the user has moved on from
          setState((previous) => (previous.status === 'ready' ? { ...previous, result: response.result, pending: false } : previous));
          return;
        case 'error':
          // Keep showing the current data if there is any; only a failed startup leaves nothing to show.
          setState((previous) =>
            previous.status === 'ready' ? { ...previous, pending: false, error: response.message } : { status: 'error', message: response.message },
          );
          return;
      }
    };
    worker.onerror = (event) => setState({ status: 'error', message: event.message || 'The analysis worker crashed.' });
    worker.postMessage({ type: 'startup' } satisfies WorkerRequest);

    return () => worker.terminate();
  }, []);

  const uploadFile = useCallback(
    (fileName: string, bytes: ArrayBuffer) => {
      setState((previous) => (previous.status === 'ready' ? { ...previous, pending: true, error: null } : previous));
      send({ type: 'load', fileName, bytes }, [bytes]); // hand the bytes over instead of copying them
    },
    [send],
  );

  const reset = useCallback(() => {
    setState((previous) => (previous.status === 'ready' ? { ...previous, pending: true, error: null } : previous));
    send({ type: 'startup' });
  }, [send]);

  // A new filter resets the chart to its default day, because the chosen day may not be in the new range.
  const setFilter = useCallback((filter: Filter) => requery(filter, {}), [requery]);
  const setView = useCallback((view: ViewOptions) => requery(current.current.filter, view), [requery]);

  return { state, uploadFile, reset, setFilter, setView };
}
