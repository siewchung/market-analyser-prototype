import { load, query, type Dataset } from '../../application/analyse';
import { parseFile } from '../parsers';
import type { WorkerRequest, WorkerResponse } from './protocol';

/**
 * Background worker: does the parsing and number-crunching off the main thread so the page never freezes.
 * It keeps the loaded dataset in memory, so changing a filter only sends a small "query" message, not the whole file again.
 */

// Tell TypeScript this file runs inside a worker, not a normal page.
const worker = self as unknown as DedicatedWorkerGlobalScope;

let dataset: Dataset | null = null;

const send = (response: WorkerResponse): void => worker.postMessage(response);

worker.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    switch (request.type) {
      case 'load': {
        dataset = load(request.fileName, await parseFile(request.fileName, request.bytes));
        // Only the first rejected rows are sent to the page; the summary carries the true total.
        send({ type: 'loaded', summary: dataset.summary, insights: dataset.insights, rejected: dataset.rejected.slice(0, dataset.config.maxIssueRows) });
        return;
      }
      case 'query': {
        if (!dataset) throw new Error('No file has been loaded yet.');
        send({ type: 'result', result: query(dataset, request.filter, request.view) });
        return;
      }
      default: {
        // If a new message type is added to the protocol but not handled here, this line stops it compiling.
        const unhandled: never = request;
        throw new Error(`Unknown request: ${JSON.stringify(unhandled)}`);
      }
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
