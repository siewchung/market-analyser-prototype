import { DEFAULT_CONFIG } from './config';
import { tradingDateFor } from './time';
import type { AnalysisConfig, Bar, RawRecord, RejectedRow, RejectReason } from './types';

/**
 * Turns raw parser rows into typed Bars.
 *
 * Files from different sources name their columns differently ("Contract" vs "contract_symbol"),
 * so we first work out which column holds which field, then convert each row.
 * Rows that can't be used are returned as RejectedRow with a reason instead of being silently dropped.
 */

/** Thrown when the file doesn't have the columns we need at all (e.g. the wrong file was uploaded). */
export class MissingColumnsError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Could not find required column(s): ${missing.join(', ')}`);
    this.name = 'MissingColumnsError';
  }
}

type Field = 'contract' | 'timestamp' | 'open' | 'high' | 'low' | 'close' | 'volume';

/**
 * Accepted column names for each field, in order of preference.
 * Names are compared after lower-casing and removing spaces/underscores, so "Trading Date" matches "tradingdate".
 * For timestamp, the Chicago wall-clock column wins over the raw epoch column when both exist.
 */
const ALIASES: Readonly<Record<Field, readonly string[]>> = {
  contract: ['contract', 'contractsymbol', 'symbol', 'ticker', 'instrument'],
  timestamp: ['timestampchicagowall', 'timestamp', 'datetime', 'time', 'date', 'timestampms'],
  open: ['open', 'o'],
  high: ['high', 'h'],
  low: ['low', 'l'],
  close: ['close', 'c', 'last'],
  volume: ['volume', 'v', 'vol'],
};

const REQUIRED: readonly Field[] = ['contract', 'timestamp', 'open', 'high', 'low', 'close'];

type ColumnMap = Readonly<Partial<Record<Field, string>>>;

const simplify = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Finds the actual column name in the file for each field. */
function resolveColumns(records: readonly RawRecord[]): ColumnMap {
  // Look at the first rows rather than just row 1, in case some rows are short.
  const headers = new Set(records.slice(0, 100).flatMap((r) => Object.keys(r)));
  const bySimpleName = new Map([...headers].map((h) => [simplify(h), h] as const));

  const map: Partial<Record<Field, string>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    const match = ALIASES[field].find((alias) => bySimpleName.has(alias));
    if (match) map[field] = bySimpleName.get(match);
  }

  const missing = REQUIRED.filter((field) => !map[field]);
  if (missing.length > 0) throw new MissingColumnsError(missing);
  return map;
}

/** Result of reading a number from a cell: it was empty, it wasn't a number, or here's the value. */
type NumberCell = { readonly kind: 'missing' } | { readonly kind: 'invalid' } | { readonly kind: 'ok'; readonly value: number };

function readNumber(value: unknown): NumberCell {
  if (value === null || value === undefined) return { kind: 'missing' };
  if (typeof value === 'bigint') return { kind: 'ok', value: Number(value) };
  if (typeof value === 'number') return Number.isFinite(value) ? { kind: 'ok', value } : { kind: 'invalid' };
  if (typeof value === 'string') {
    if (value.trim() === '') return { kind: 'missing' };
    const n = Number(value);
    return Number.isFinite(n) ? { kind: 'ok', value: n } : { kind: 'invalid' };
  }
  return { kind: 'invalid' };
}

/** Plain date-time without a timezone, e.g. "2025-11-03 09:30:00" or "2025-11-03T09:30". */
const NAIVE_DATE_TIME = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/;

/**
 * Converts a timestamp cell into wall-clock ms, or null if it can't be read.
 * - Date objects (Parquet) already hold the wall-clock time in their UTC fields.
 * - Numbers are epoch values; small ones are assumed to be seconds rather than milliseconds.
 * - Text without a timezone is read as wall-clock time (we add "Z" so the browser doesn't apply its own timezone).
 */
function readTimestamp(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();

  const asNumber = readNumber(value);
  if (asNumber.kind === 'ok') {
    const SECONDS_CUTOFF = 1e11; // 1e11 ms is 1973; 1e11 seconds is far in the future, so this split is safe
    return Math.abs(asNumber.value) < SECONDS_CUTOFF ? asNumber.value * 1000 : asNumber.value;
  }

  if (typeof value !== 'string') return null;
  const text = value.trim();
  const parsed = NAIVE_DATE_TIME.test(text) ? Date.parse(`${text.replace(' ', 'T')}Z`) : Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

type RowResult = { readonly ok: true; readonly bar: Bar } | { readonly ok: false; readonly reason: RejectReason };

function toBar(record: RawRecord, columns: ColumnMap, sourceRow: number, config: AnalysisConfig): RowResult {
  const cell = (field: Field): unknown => (columns[field] ? record[columns[field]] : undefined);

  const contract = String(cell('contract') ?? '').trim();
  if (contract === '') return { ok: false, reason: 'missing_contract' };

  const timestamp = readTimestamp(cell('timestamp'));
  if (timestamp === null) return { ok: false, reason: 'bad_timestamp' };

  const prices = (['open', 'high', 'low', 'close'] as const).map((field) => readNumber(cell(field)));
  if (prices.some((p) => p.kind === 'missing')) return { ok: false, reason: 'missing_price' };
  if (prices.some((p) => p.kind === 'invalid')) return { ok: false, reason: 'non_numeric_price' };
  const [open, high, low, close] = prices.map((p) => (p.kind === 'ok' ? p.value : NaN)) as [number, number, number, number];

  // Unreadable volume is treated like a missing one: the bar is still usable, and the quality checks flag it.
  const volumeCell = readNumber(cell('volume'));
  const volume = volumeCell.kind === 'ok' ? volumeCell.value : null;

  // Always derived from the timestamp. A source "trading_date" column is ignored: in the sample dataset it is just
  // the calendar date, which would put evening-session bars on the wrong trading day.
  const tradingDate = tradingDateFor(timestamp, config.sessionBreak);

  return { ok: true, bar: { contract, timestamp, tradingDate, open, high, low, close, volume, sourceRow } };
}

/**
 * Converts every raw row, splitting the results into usable bars and rejected rows.
 * `firstRowNumber` is the row number of records[0] in the user's file, so issues point at the right line.
 */
export function normalise(
  records: readonly RawRecord[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  firstRowNumber = 1,
): { bars: Bar[]; rejected: RejectedRow[] } {
  if (records.length === 0) return { bars: [], rejected: [] };

  const columns = resolveColumns(records);
  const bars: Bar[] = [];
  const rejected: RejectedRow[] = [];

  records.forEach((record, index) => {
    const sourceRow = index + firstRowNumber;
    const result = toBar(record, columns, sourceRow, config);
    if (result.ok) bars.push(result.bar);
    else rejected.push({ sourceRow, reason: result.reason, raw: record });
  });

  return { bars, rejected };
}
