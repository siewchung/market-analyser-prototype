import { describe, expect, it } from 'vitest';
import { priceDecimals } from '../../../src/domain/bars';
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
