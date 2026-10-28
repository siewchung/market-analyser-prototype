import type { QueryResult, ViewOptions } from '../../application/analyse';
import type { QualityReport } from '../../application/qualityReport';
import type { Filter } from '../../domain/types';

/**
 * The messages passed between the page and the background worker.
 * Each message has a `type`, so TypeScript can check that both sides handle every kind of message.
 */

/** Where the data on screen came from: the sample loaded at startup, or a file the user uploaded. */
export type DataOrigin = 'startup' | 'uploaded';

/** Page -> worker. */
export type WorkerRequest =
  | { readonly type: 'startup' } // load the startup data (also used for "Reset to startup data")
  | { readonly type: 'load'; readonly fileName: string; readonly bytes: ArrayBuffer } // an uploaded file
  | { readonly type: 'query'; readonly queryId: number; readonly filter: Filter; readonly view: ViewOptions };

/** Worker -> page. */
export type WorkerResponse =
  | {
      readonly type: 'ready';
      readonly origin: DataOrigin;
      readonly fileName: string | null; // the uploaded file's name; null for the startup data
      readonly report: QualityReport;
      readonly minuteContracts: readonly string[]; // contracts whose minute data is available for Analytics
    }
  | {
      readonly type: 'result';
      readonly queryId: number;
      readonly result: QueryResult;
      readonly warning: string | null; // e.g. the minute file couldn't be loaded, so these are daily bars
    }
  | { readonly type: 'error'; readonly message: string };
