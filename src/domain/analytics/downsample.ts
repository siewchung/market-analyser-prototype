/**
 * Thins a long series down to at most `maxPoints` by keeping evenly spaced points (always keeping the last one).
 * Charts can't usefully show 100k points and get slow trying; this keeps the overall shape.
 * Trade-off: very short spikes between kept points can disappear from the chart (they're still in the data and the issue list).
 */
export function downsample<T>(points: readonly T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return [...points];
  const step = Math.ceil(points.length / (maxPoints - 1));
  const kept = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  return last !== undefined && kept.at(-1) !== last ? [...kept, last] : kept;
}
