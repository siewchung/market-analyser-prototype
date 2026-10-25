import type { ParsedFile } from '../../domain/types';
import { parseCsv } from './csv';
import { parseParquet } from './parquet';

/** Thrown when the uploaded file isn't a format we can read. */
export class UnsupportedFileError extends Error {
  constructor(fileName: string) {
    super(`Unsupported file type: "${fileName}". Please upload a .csv or .parquet file.`);
    this.name = 'UnsupportedFileError';
  }
}

/**
 * Picks the right parser from the file extension. To support a new format, add a branch here.
 * CSV data starts on line 2 (after the header), so row numbers match what users see in Excel.
 * Known limitation: blank lines in a CSV are skipped, so row numbers after a blank line are one lower than the file's line.
 */
export async function parseFile(fileName: string, bytes: ArrayBuffer): Promise<ParsedFile> {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'csv') return { records: parseCsv(new TextDecoder('utf-8').decode(bytes)), firstRowNumber: 2 }; // TextDecoder drops any BOM
  if (extension === 'parquet') return { records: await parseParquet(bytes), firstRowNumber: 1 };
  throw new UnsupportedFileError(fileName);
}
