import { describe, expect, it } from 'vitest';
import { formatIssueTime } from '../../../src/ui/issueText';
import { wall } from '../../helpers';

describe('formatIssueTime', () => {
  it('shows date and Chicago time for minute data', () => {
    expect(formatIssueTime(wall('2025-03-12T09:31'), 'intraday')).toBe('2025-03-12 09:31');
  });

  it('shows the date only for daily data, which has no time of day', () => {
    expect(formatIssueTime(wall('2025-03-12T00:00'), 'daily')).toBe('2025-03-12');
  });
});
