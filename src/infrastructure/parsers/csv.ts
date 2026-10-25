import Papa from 'papaparse';
import type { RawRecord } from '../../domain/types';

/**
 * Parses CSV text into one record per data row, keyed by the header row.
 * Values are deliberately left as text: converting them is the normaliser's job,
 * so every file format goes through the same validation rules.
 * Short or long rows are kept as-is; the normaliser decides whether they're usable.
 */
export function parseCsv(text: string): RawRecord[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy', // also skips lines that are only commas/whitespace
    transformHeader: (header) => header.trim(),
  });
  return result.data;
}
