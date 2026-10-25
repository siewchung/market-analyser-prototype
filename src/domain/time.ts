import type { AnalysisConfig } from './types';

/** Small date helpers. All of them read wall-clock ms with getUTC* (see the note in types.ts). */

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

/** "YYYY-MM-DD" for a wall-clock timestamp. */
export const toDateString = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

/**
 * The CME trading day a bar belongs to, as "YYYY-MM-DD".
 * Each Globex session opens at 17:00 CT the evening before, so anything at or after the reopen
 * belongs to the next day's session (e.g. Sunday 18:00 counts towards Monday).
 * Daily data stamped at midnight is unaffected.
 */
export function tradingDateFor(timestamp: number, sessionBreak: AnalysisConfig['sessionBreak']): string {
  const minuteOfDay = Math.floor((timestamp % DAY_MS) / MINUTE_MS);
  return toDateString(minuteOfDay >= sessionBreak.endMinute ? timestamp + DAY_MS : timestamp);
}

/** Hour of day (0-23) in Chicago time. */
export const hourOfDay = (timestamp: number): number => new Date(timestamp).getUTCHours();

/**
 * When the CME Globex market is closed on a given weekday, as [start, end) minutes after midnight.
 * - Monday-Thursday: the daily maintenance break (16:00-17:00 CT by default).
 * - Friday: closes at 16:00 for the weekend.
 * - Saturday: closed all day.
 * - Sunday: reopens at 17:00.
 */
function closedWindows(dayOfWeek: number, sessionBreak: AnalysisConfig['sessionBreak']): ReadonlyArray<readonly [number, number]> {
  const END_OF_DAY = 24 * 60;
  switch (dayOfWeek) {
    case 5: // Friday
      return [[sessionBreak.startMinute, END_OF_DAY]];
    case 6: // Saturday
      return [[0, END_OF_DAY]];
    case 0: // Sunday
      return [[0, sessionBreak.endMinute]];
    default: // Monday-Thursday
      return [[sessionBreak.startMinute, sessionBreak.endMinute]];
  }
}

/**
 * How many minutes between two timestamps the market was scheduled to be closed.
 * Used by the gap check so the daily break and weekends aren't reported as missing data.
 * Exchange holidays are not modelled (a known limitation, documented in the README).
 */
export function closedMinutesBetween(from: number, to: number, sessionBreak: AnalysisConfig['sessionBreak']): number {
  let total = 0;
  // Walk day by day from the start date to the end date, adding up the closed windows that overlap the range.
  for (let dayStart = Math.floor(from / DAY_MS) * DAY_MS; dayStart < to; dayStart += DAY_MS) {
    const dayOfWeek = new Date(dayStart).getUTCDay();
    for (const [startMinute, endMinute] of closedWindows(dayOfWeek, sessionBreak)) {
      const overlapStart = Math.max(from, dayStart + startMinute * MINUTE_MS);
      const overlapEnd = Math.min(to, dayStart + endMinute * MINUTE_MS);
      if (overlapEnd > overlapStart) total += (overlapEnd - overlapStart) / MINUTE_MS;
    }
  }
  return total;
}
