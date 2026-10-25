import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/domain/config';
import { closedMinutesBetween, tradingDateFor } from '../../../src/domain/time';
import { wall } from '../../helpers';

const closed = (from: string, to: string): number => closedMinutesBetween(wall(from), wall(to), DEFAULT_CONFIG.sessionBreak);

// 2025-11-03 is a Monday.
describe('closedMinutesBetween', () => {
  it('is zero during normal trading hours', () => {
    expect(closed('2025-11-03T09:30', '2025-11-03T10:30')).toBe(0);
  });

  it('counts the 16:00-17:00 daily maintenance break', () => {
    expect(closed('2025-11-03T15:58', '2025-11-03T17:01')).toBe(60);
  });

  it('counts only the overlapping part of the break', () => {
    expect(closed('2025-11-03T16:30', '2025-11-03T17:10')).toBe(30);
  });

  it('counts the whole weekend: Friday 16:00 to Sunday 17:00', () => {
    expect(closed('2025-11-07T15:59', '2025-11-09T17:00')).toBe(49 * 60);
  });

  it('adds up breaks across several days', () => {
    expect(closed('2025-11-03T09:00', '2025-11-05T09:00')).toBe(120); // Mon and Tue breaks
  });
});

describe('tradingDateFor', () => {
  const day = (at: string) => tradingDateFor(wall(at), DEFAULT_CONFIG.sessionBreak);

  it('keeps daytime and midnight-stamped daily bars on their own date', () => {
    expect(day('2025-11-03T09:30')).toBe('2025-11-03');
    expect(day('2025-11-03T00:00')).toBe('2025-11-03');
    expect(day('2025-11-03T16:59')).toBe('2025-11-03');
  });

  it('moves bars from the 17:00 reopen onwards to the next day, including Sunday evening to Monday', () => {
    expect(day('2025-11-03T17:00')).toBe('2025-11-04');
    expect(day('2025-11-02T18:00')).toBe('2025-11-03');
  });
});
