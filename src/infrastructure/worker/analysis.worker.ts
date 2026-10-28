import reportJson from '../../../data/quality-report.json';
import { load, query, type Dataset } from '../../application/analyse';
import { buildQualityReport, QUALITY_REPORT_VERSION, toFileAnalysis, type QualityReport } from '../../application/qualityReport';
import { DEFAULT_CONFIG } from '../../domain/config';
import { parseFile } from '../parsers';
import type { DataOrigin, WorkerRequest, WorkerResponse } from './protocol';
import { buildStartupSources, createSerialQueue, withFallback, type DataFile } from './sources';

/**
 * Background worker: does the downloading, parsing and number-crunching off the main thread so the page never freezes.
 *
 * At startup it loads the daily files for every contract (small, committed to the repo) and the precomputed quality
 * report for the whole sample. Minute data is large, so it is loaded one contract at a time, only when Analytics asks
 * for that contract. An uploaded file replaces all of this until the user resets.
 */

// Tell TypeScript this file runs inside a worker, not a normal page.
const worker = self as unknown as DedicatedWorkerGlobalScope;

// Vite finds these files when the app is built and gives each one a URL. The minute folder only exists after
// `npm run download-dataset`; without it, the list is simply empty and Analytics falls back to daily data.
const sources = buildStartupSources(
  import.meta.glob<string>('/data/daily/**/*.parquet', { query: '?url', import: 'default', eager: true }),
  import.meta.glob<string>('/sample-data/data/minute/**/*.parquet', { query: '?url', import: 'default', eager: true }),
);

/** What the worker is currently serving. */
type Active =
  | { readonly origin: 'startup'; readonly report: QualityReport; readonly daily: Dataset }
  | { readonly origin: 'uploaded'; readonly report: QualityReport; readonly dataset: Dataset };

let active: Active | null = null;
// Only one contract's minute data is kept at a time; a large contract can use about 500 MB.
let minuteCache: { readonly contract: string; readonly dataset: Dataset } | null = null;

const send = (response: WorkerResponse): void => worker.postMessage(response);
const enqueue = createSerialQueue();

async function fetchAndParse(file: DataFile) {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`Could not load ${file.contract} (${file.interval}): HTTP ${response.status}`);
  return parseFile(`${file.contract}.parquet`, await response.arrayBuffer());
}

/** The committed report, checked against the code's version so a stale file is caught instead of misread. */
function startupReport(): QualityReport {
  if (reportJson.version !== QUALITY_REPORT_VERSION) {
    throw new Error('data/quality-report.json is out of date. Run npm run build-quality-report.');
  }
  return reportJson as unknown as QualityReport;
}

async function loadStartup(): Promise<void> {
  const parsed = await Promise.all(sources.daily.map(fetchAndParse));
  const daily = load('Daily sample', { records: parsed.flatMap((p) => p.records), firstRowNumber: 1 });
  active = { origin: 'startup', report: startupReport(), daily };
  minuteCache = null;
  sendReady('startup', null);
}

function loadUpload(fileName: string, dataset: Dataset): void {
  active = { origin: 'uploaded', report: buildQualityReport([toFileAnalysis(fileName, dataset)], DEFAULT_CONFIG), dataset };
  minuteCache = null;
  sendReady('uploaded', fileName);
}

function sendReady(origin: DataOrigin, fileName: string | null): void {
  if (!active) return;
  const minuteContracts = origin === 'startup' ? [...sources.minuteByContract.keys()] : [];
  send({ type: 'ready', origin, fileName, report: active.report, minuteContracts });
}

/**
 * Picks the data to answer a query from: the contract's minute data if there is any, otherwise the daily data.
 * If the minute file can't be loaded, the daily data is used and `warning` says why, so the screen always shows
 * the contract the user picked.
 */
async function datasetFor(contract: string | undefined): Promise<{ readonly dataset: Dataset; readonly warning: string | null }> {
  if (!active) throw new Error('No data has been loaded yet.');
  if (active.origin === 'uploaded') return { dataset: active.dataset, warning: null };
  const minuteFile = contract ? sources.minuteByContract.get(contract) : undefined;
  if (!minuteFile) return { dataset: active.daily, warning: null };
  if (minuteCache?.contract === minuteFile.contract) return { dataset: minuteCache.dataset, warning: null };

  minuteCache = null; // let the previous contract's bars be freed before loading the next one
  const { value, failure } = await withFallback(async () => load(`${minuteFile.contract} minute`, await fetchAndParse(minuteFile)), null);
  if (!value) return { dataset: active.daily, warning: `Couldn't load minute data for ${minuteFile.contract} (${failure}). Showing daily bars.` };
  minuteCache = { contract: minuteFile.contract, dataset: value };
  return { dataset: value, warning: null };
}

worker.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  // Requests run one at a time, in order, so a slow minute download can't answer after a newer request.
  void enqueue(async () => {
    try {
      switch (request.type) {
        case 'startup':
          await loadStartup();
          return;
        case 'load':
          // If the file can't be read, this throws and the previous data stays active.
          loadUpload(request.fileName, load(request.fileName, await parseFile(request.fileName, request.bytes)));
          return;
        case 'query': {
          const { dataset, warning } = await datasetFor(request.filter.contracts[0]);
          send({ type: 'result', queryId: request.queryId, result: query(dataset, request.filter, request.view), warning });
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
  });
};
