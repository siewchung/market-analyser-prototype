import { describe, expect, it } from 'vitest';
import { fileInterval, priceDecimals, rootOf } from '../../../src/domain/bars';
import { bar } from '../../helpers';

describe('priceDecimals', () => {
  it('uses the most precise price seen for each contract', () => {
    const bars = [
      bar({ contract: 'CLZ25', open: 61, high: 61.3, low: 60.9, close: 61.25 }),
      bar({ contract: 'ESZ25', open: 5000, high: 5002, low: 4999, close: 5001 }),
      bar({ contract: 'ZNH26', open: 112.09375, high: 112.09375, low: 112.09375, close: 112.09375 }),
    ];
    expect(priceDecimals(bars)).toEqual({ CLZ25: 2, ESZ25: 0, ZNH26: 5 });
  });

  it('caps the number of decimals', () => {
    expect(priceDecimals([bar({ open: 1.123456789, high: 2, low: 1, close: 1 })])).toEqual({ ESZ25: 6 });
  });
});

describe('rootOf', () => {
  it('strips the month code and two-digit year from a contract symbol', () => {
    expect(rootOf('ESZ25')).toBe('ES');
    expect(rootOf('SR3M26')).toBe('SR3');
    expect(rootOf('VXX25')).toBe('VX');
  });

  it('returns the symbol unchanged when it has no month code and year', () => {
    expect(rootOf('WEIRD')).toBe('WEIRD');
  });
});

describe('fileInterval', () => {
  it('is daily when every contract has at most one bar per trading day', () => {
    expect(fileInterval([bar({ at: '2025-11-03T09:30' }), bar({ at: '2025-11-04T09:30' })])).toBe('daily');
  });

  it('is intraday when a contract has several bars on one trading day', () => {
    expect(fileInterval([bar({ at: '2025-11-03T09:30' }), bar({ at: '2025-11-03T09:31' })])).toBe('intraday');
  });
});
