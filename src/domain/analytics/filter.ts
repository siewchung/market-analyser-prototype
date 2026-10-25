import type { Filter } from '../types';

/**
 * True if a row for this contract on this date ("YYYY-MM-DD") passes the user's filter.
 * An empty contract list means "all contracts"; missing dates mean "no limit". Both date ends are inclusive.
 * Dates in "YYYY-MM-DD" form sort correctly as plain text, so a string comparison is enough.
 */
export function matchesFilter(filter: Filter, contract: string, date: string): boolean {
  if (filter.contracts.length > 0 && !filter.contracts.includes(contract)) return false;
  if (filter.from && date < filter.from) return false;
  if (filter.to && date > filter.to) return false;
  return true;
}
