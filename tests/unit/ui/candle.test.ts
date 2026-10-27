import { describe, expect, it } from 'vitest';
import { candleGeometry } from '../../../src/ui/charts/candle';

// A simple scale for testing: price 0 is at pixel 100, and each price point is one pixel higher up the screen.
const yScale = (price: number): number => 100 - price;

describe('candleGeometry', () => {
  it('places the body between open and close and the wick between high and low', () => {
    expect(candleGeometry({ open: 10, high: 15, low: 5, close: 12 }, yScale)).toEqual({
      direction: 'up',
      bodyTop: 88,
      bodyBottom: 90,
      wickTop: 85,
      wickBottom: 95,
    });
  });

  it('marks a day that closed below its open as down', () => {
    expect(candleGeometry({ open: 12, high: 15, low: 5, close: 10 }, yScale).direction).toBe('down');
  });

  it('keeps a body at least one pixel tall when open equals close, so the day stays visible', () => {
    const g = candleGeometry({ open: 10, high: 10, low: 10, close: 10 }, yScale);
    expect(g.bodyBottom - g.bodyTop).toBe(1);
  });
});
