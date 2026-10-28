import { describe, expect, it } from 'vitest';
import { formatIssueTime, formatSourceRows } from '../../../src/ui/issueText';
import { wall } from '../../helpers';

describe('formatIssueTime', () => {
  it('shows date and Chicago time for minute data', () => {
    expect(formatIssueTime(wall('2025-03-12T09:31'), 'intraday')).toBe('2025-03-12 09:31');
  });

  it('shows the date only for daily data, which has no time of day', () => {
    expect(formatIssueTime(wall('2025-03-12T00:00'), 'daily')).toBe('2025-03-12');
  });
});

describe('formatSourceRows', () => {
  it('shows a single row as its number', () => {
    expect(formatSourceRows([8])).toBe('8');
  });

  it('lists every row involved, e.g. both copies of a duplicate', () => {
    expect(formatSourceRows([4, 5])).toBe('4, 5');
  });

  it('adds thousands separators so big files stay readable', () => {
    expect(formatSourceRows([679428])).toBe('679,428');
  });
});
