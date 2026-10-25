import type { Bar } from '../src/domain/types';

/** Wall-clock ms for "YYYY-MM-DDTHH:MM", using the app's convention (Chicago time stored as UTC). */
export const wall = (iso: string): number => Date.parse(`${iso}:00Z`);

let nextRow = 1;

/** Builds a valid bar with sensible defaults; override only what the test cares about. */
export const bar = (overrides: Partial<Bar> & { at?: string } = {}): Bar => {
  const { at, ...rest } = overrides;
  const timestamp = at ? wall(at) : (rest.timestamp ?? wall('2025-11-03T09:30'));
  return {
    contract: 'ESZ25',
    timestamp,
    tradingDate: new Date(timestamp).toISOString().slice(0, 10),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
    sourceRow: nextRow++,
    ...rest,
  };
};
