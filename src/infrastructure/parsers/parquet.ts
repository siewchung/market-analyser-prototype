import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import type { RawRecord } from '../../domain/types';

/**
 * Reads every row of a Parquet file into plain objects.
 * `compressors` adds ZSTD/GZIP/etc. support - the sample dataset is ZSTD-compressed,
 * which the base library can't read on its own.
 */
export async function parseParquet(bytes: ArrayBuffer): Promise<RawRecord[]> {
  return parquetReadObjects({ file: bytes, compressors });
}
