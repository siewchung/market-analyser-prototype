import type { BarInterval } from '../../domain/types';

/** One data file the worker can fetch: which contract it holds, whether it's daily or minute data, and its URL. */
export interface DataFile {
  readonly contract: string;
  readonly interval: BarInterval;
  readonly url: string;
}

/** The contract symbol from a path like "/data/daily/CME/ES/ESZ25.parquet" (the file name without ".parquet"). */
const contractFromPath = (path: string): string => (path.split('/').pop() ?? path).replace(/\.parquet$/, '');

const toFiles = (urls: Readonly<Record<string, string>>, interval: BarInterval): DataFile[] =>
  Object.entries(urls)
    .map(([path, url]) => ({ contract: contractFromPath(path), interval, url }))
    .sort((a, b) => a.contract.localeCompare(b.contract));

/**
 * Turns the lists of files Vite found at build time (path -> URL) into what the worker loads.
 * Daily files are all loaded at startup. Minute files are looked up by contract and loaded only when needed.
 * If the minute data hasn't been downloaded, `minuteByContract` is simply empty.
 */
export function buildStartupSources(
  daily: Readonly<Record<string, string>>,
  minute: Readonly<Record<string, string>>,
): { readonly daily: readonly DataFile[]; readonly minuteByContract: ReadonlyMap<string, DataFile> } {
  return {
    daily: toFiles(daily, 'daily'),
    minuteByContract: new Map(toFiles(minute, 'intraday').map((f) => [f.contract, f])),
  };
}

/**
 * Runs async jobs one after another, in the order they were added.
 * The worker uses this so that, for example, a slow minute-file download for one contract can't finish after
 * (and overwrite) a later request for another contract. A failed job doesn't stop the jobs after it.
 */
export function createSerialQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const next = last.then(job, job);
    last = next.catch(() => undefined); // keep the chain alive after a failure
    return next;
  };
}
