import { describe, expect, it } from 'vitest';
import { buildStartupSources, createSerialQueue, withFallback } from '../../../src/infrastructure/worker/sources';

describe('buildStartupSources', () => {
  it('maps file paths to contracts', () => {
    const sources = buildStartupSources(
      { '/data/daily/CME/ES/ESZ25.parquet': '/assets/ESZ25-daily.parquet' },
      { '/sample-data/data/minute/CME/ES/ESZ25.parquet': '/assets/ESZ25-minute.parquet' },
    );
    expect(sources.daily).toEqual([{ contract: 'ESZ25', interval: 'daily', url: '/assets/ESZ25-daily.parquet' }]);
    expect(sources.minuteByContract.get('ESZ25')).toEqual({ contract: 'ESZ25', interval: 'intraday', url: '/assets/ESZ25-minute.parquet' });
  });

  it('has no minute files when the minute data has not been downloaded', () => {
    const sources = buildStartupSources({ '/data/daily/CME/ES/ESZ25.parquet': '/a.parquet' }, {});
    expect(sources.minuteByContract.size).toBe(0);
    expect(sources.daily).toHaveLength(1);
  });
});

describe('createSerialQueue', () => {
  it('finishes jobs in the order they were added, even when a later one is faster', async () => {
    const enqueue = createSerialQueue();
    const finished: string[] = [];
    const slow = enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      finished.push('slow');
    });
    const fast = enqueue(async () => {
      finished.push('fast');
    });
    await Promise.all([slow, fast]);
    expect(finished).toEqual(['slow', 'fast']);
  });

  it('keeps going after a job fails', async () => {
    const enqueue = createSerialQueue();
    const failed = enqueue(async () => {
      throw new Error('boom');
    });
    await expect(failed).rejects.toThrow('boom');
    await expect(enqueue(async () => 'next')).resolves.toBe('next');
  });
});

describe('withFallback', () => {
  it('uses the main value when it loads', async () => {
    expect(await withFallback(async () => 'minute', 'daily')).toEqual({ value: 'minute', failure: null });
  });

  it('falls back and explains why when the main value fails to load', async () => {
    const result = await withFallback(async () => {
      throw new Error('HTTP 404');
    }, 'daily');
    expect(result).toEqual({ value: 'daily', failure: 'HTTP 404' });
  });
});
