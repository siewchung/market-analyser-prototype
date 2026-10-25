import { describe, expect, it } from 'vitest';
import { formatCell, formatDate, formatDateTime, formatPrice, formatShortDate, formatTime } from '../../../src/ui/format';
import { wall } from '../../helpers';

describe('date formatting', () => {
  it('shows friendly dates, the same for every viewer', () => {
    expect(formatDate('2026-03-09')).toBe('Mon 9 Mar 2026');
    expect(formatDateTime(wall('2026-03-09T06:18'))).toBe('Mon 9 Mar 2026 06:18');
    expect(formatTime(wall('2026-03-09T17:05'))).toBe('17:05');
    expect(formatShortDate(wall('2026-03-09T17:05'))).toBe('9 Mar');
  });

  it('uses three-letter month names for every month (no "Sept" or "July")', () => {
    expect(formatDate('2025-07-15')).toBe('Tue 15 Jul 2025');
    expect(formatDate('2025-09-02')).toBe('Tue 2 Sep 2025');
    expect(formatShortDate(wall('2025-06-27T09:30'))).toBe('27 Jun');
  });
});

describe('formatPrice', () => {
  it('always shows the given number of decimals', () => {
    expect(formatPrice(61, 2)).toMatch(/^61[.,]00$/);
    expect(formatPrice(61.25, 2)).toMatch(/^61[.,]25$/);
  });
});

describe('formatCell', () => {
  it('labels empty cells and copes with Parquet value types', () => {
    expect(formatCell('')).toBe('(empty)');
    expect(formatCell(undefined)).toBe('(empty)');
    expect(formatCell(5n)).toBe('5');
    expect(formatCell(new Date('2025-06-27T09:30:00Z'))).toBe('2025-06-27T09:30:00.000Z');
  });
});
