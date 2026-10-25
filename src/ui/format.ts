/**
 * Display helpers. Timestamps are wall-clock ms (Chicago time stored as UTC),
 * so every formatter here reads them in the UTC time zone to show Chicago time unchanged.
 * Dates look like "Mon 9 Mar 2026". They're built from fixed name lists rather than the browser's locale,
 * because locales disagree on short month names (some write "Sept" or "July") and the result should be identical for everyone.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "2026-03-09" -> "Mon 9 Mar 2026". */
export const formatDate = (isoDate: string): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Wall-clock ms -> "09:30". */
export const formatTime = (timestamp: number): string => new Date(timestamp).toISOString().slice(11, 16);

/** Wall-clock ms -> "Mon 9 Mar 2026 09:30". */
export const formatDateTime = (timestamp: number): string => `${formatDate(new Date(timestamp).toISOString().slice(0, 10))} ${formatTime(timestamp)}`;

/** Wall-clock ms -> "9 Mar", for chart axes where space is tight. */
export const formatShortDate = (timestamp: number): string => {
  const d = new Date(timestamp);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

export const formatNumber = (value: number, maxDecimals = 4): string => value.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });

/** A price with a fixed number of decimals, so a column of prices lines up (61.00 next to 61.25). */
export const formatPrice = (value: number, decimals: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Capitalises the first letter: "missing volume" -> "Missing volume". */
export const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** One cell of a raw file row as readable text. Parquet values can be bigint or Date; empty cells are labelled. */
export const formatCell = (value: unknown): string => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return '(empty)';
  if (value instanceof Date) return value.toISOString();
  return String(value);
};
