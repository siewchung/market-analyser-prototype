import { describe, expect, it } from 'vitest';
import { clean } from '../../../../src/domain/quality/clean';
import { bar } from '../../../helpers';

describe('clean', () => {
  it('drops invalid prices, keeps the first of any duplicates, and sorts by contract then time', () => {
    const later = bar({ at: '2025-11-03T09:31' });
    const first = bar({ at: '2025-11-03T09:30' });
    const conflict = { ...first, close: 100.5, sourceRow: 999 };
    const invalid = bar({ at: '2025-11-03T09:32', high: 90 });
    const other = bar({ contract: 'CLZ25', at: '2025-11-03T09:45' });

    expect(clean([later, first, conflict, invalid, other])).toEqual([other, first, later]);
  });

  it('keeps impossible prices and conflicting duplicates when asked, but still drops exact copies', () => {
    const first = bar({ at: '2025-11-03T09:30' });
    const exactCopy = { ...first, sourceRow: 998 };
    const conflict = { ...first, close: 100.5, sourceRow: 999 };
    const invalid = bar({ at: '2025-11-03T09:32', high: 90 });
    expect(clean([first, exactCopy, conflict, invalid])).toEqual([first]);
    expect(clean([first, exactCopy, conflict, invalid], { keepErrorBars: true })).toEqual([first, conflict, invalid]);
  });

  it('blanks out negative volume so it cannot distort VWAP, but keeps the bar', () => {
    const [cleaned] = clean([bar({ volume: -10 })]);
    expect(cleaned?.volume).toBeNull();
  });

  it('does not change the input array', () => {
    const input = [bar({ at: '2025-11-03T09:31' }), bar({ at: '2025-11-03T09:30' })];
    const snapshot = [...input];
    clean(input);
    expect(input).toEqual(snapshot);
  });
});
