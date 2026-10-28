import type { DailyBar } from '../../domain/types';

/** Where one day's candle sits on screen, in pixels (smaller numbers are higher up). */
export interface CandleGeometry {
  readonly bodyTop: number;
  readonly bodyBottom: number;
  readonly wickTop: number;
  readonly wickBottom: number;
  readonly direction: 'up' | 'down'; // up = closed at or above the open
}

/**
 * Converts one day's prices into pixel positions for a candlestick.
 * The body spans open to close; the thin wick spans the day's high to low. `yScale` maps a price to a y pixel.
 */
export function candleGeometry(bar: Pick<DailyBar, 'open' | 'high' | 'low' | 'close'>, yScale: (price: number) => number): CandleGeometry {
  const bodyTop = yScale(Math.max(bar.open, bar.close));
  // A day that opened and closed at the same price would have no body at all, so give it one pixel.
  const bodyBottom = Math.max(yScale(Math.min(bar.open, bar.close)), bodyTop + 1);
  return {
    bodyTop,
    bodyBottom,
    wickTop: yScale(bar.high),
    wickBottom: yScale(bar.low),
    direction: bar.close >= bar.open ? 'up' : 'down',
  };
}
