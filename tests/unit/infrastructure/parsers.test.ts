import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../src/infrastructure/parsers/csv';
import { parseFile, UnsupportedFileError } from '../../../src/infrastructure/parsers';

// Reads a fixture as an ArrayBuffer, the same shape the browser hands us from an uploaded File.
const fixture = (name: string): ArrayBuffer => {
  const buf = readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

describe('parseCsv', () => {
  it('returns one record per data row, keyed by trimmed header, values left as text', () => {
    expect(parseCsv(' Contract , Close \nESZ25,5001\n')).toEqual([{ Contract: 'ESZ25', Close: '5001' }]);
  });

  it('skips blank lines', () => {
    expect(parseCsv('Contract,Close\n\nESZ25,5001\n\n')).toHaveLength(1);
  });

  it('keeps short rows so the normaliser can reject them with a reason', () => {
    const [record] = parseCsv('Contract,Open,Close\nESZ25,5000\n');
    expect(record).toEqual({ Contract: 'ESZ25', Open: '5000' });
  });
});

describe('parseFile', () => {
  it('parses the dirty CSV fixture', async () => {
    const { records, firstRowNumber } = await parseFile('dirty.csv', fixture('dirty.csv'));
    expect(records).toHaveLength(27);
    expect(firstRowNumber).toBe(2); // line 1 is the header, as in Excel
  });

  it('strips a UTF-8 byte-order mark (common in Excel exports)', async () => {
    const bytes = new TextEncoder().encode('﻿Contract,Close\nESZ25,1\n');
    const [record] = (await parseFile('excel.CSV', bytes.buffer)).records;
    expect(Object.keys(record ?? {})).toEqual(['Contract', 'Close']);
  });

  it('parses a real ZSTD-compressed Parquet file from the sample dataset', async () => {
    const { records, firstRowNumber } = await parseFile('sample-daily.parquet', fixture('sample-daily.parquet'));
    expect(records).toHaveLength(190);
    expect(firstRowNumber).toBe(1);
    expect(records[0]).toMatchObject({ contract_symbol: 'ZNH26' });
  });

  it('rejects unsupported file types with a clear error', async () => {
    await expect(parseFile('prices.xlsx', new ArrayBuffer(0))).rejects.toThrow(UnsupportedFileError);
  });
});
