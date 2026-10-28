import { describe, expect, it } from 'vitest';
import { parseTab } from '../../../src/ui/useHashTab';

describe('parseTab', () => {
  it('reads the tab from the address bar hash', () => {
    expect(parseTab('#quality')).toBe('quality');
    expect(parseTab('#analytics')).toBe('analytics');
  });

  it('falls back to the overview for an empty or unknown hash', () => {
    expect(parseTab('')).toBe('overview');
    expect(parseTab('#nope')).toBe('overview');
  });
});
