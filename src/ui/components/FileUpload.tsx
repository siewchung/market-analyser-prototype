import type { ChangeEvent } from 'react';
import dirtySampleUrl from '../../../tests/fixtures/dirty.csv?url';
import minuteSampleUrl from '../../../tests/fixtures/sample-minute.parquet?url';

interface Props {
  readonly variant: 'hero' | 'compact'; // hero = big welcome panel before any data; compact = slim bar once data is loaded
  readonly onFile: (fileName: string, bytes: ArrayBuffer) => void;
  readonly disabled: boolean;
}

/** Built-in example files, so people can try the app without finding data first. */
const SAMPLES = [
  { label: 'Messy CSV sample', fileName: 'dirty.csv', url: dirtySampleUrl },
  { label: 'Real ZN minute data', fileName: 'sample-minute.parquet', url: minuteSampleUrl },
] as const;

/** Lets the user pick a CSV/Parquet file, or load one of the samples. */
export function FileUpload({ variant, onFile, disabled }: Props) {
  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file.name, await file.arrayBuffer());
    event.target.value = ''; // allow re-selecting the same file
  };

  const loadSample = async (sample: (typeof SAMPLES)[number]) => {
    const response = await fetch(sample.url);
    onFile(sample.fileName, await response.arrayBuffer());
  };

  const buttons = (
    <div className="upload-actions">
      <label className={`button primary ${disabled ? 'disabled' : ''}`}>
        {variant === 'hero' ? 'Upload CSV or Parquet file' : 'Load another file'}
        <input type="file" accept=".csv,.parquet" onChange={handleChange} disabled={disabled} hidden />
      </label>
      <span className="muted">or try a sample:</span>
      {SAMPLES.map((sample) => (
        <button key={sample.fileName} className="button" onClick={() => loadSample(sample)} disabled={disabled}>
          {sample.label}
        </button>
      ))}
    </div>
  );

  if (variant === 'compact') return <section className="panel upload-bar">{buttons}</section>;

  return (
    <section className="panel hero">
      <h2>Check your futures data in seconds</h2>
      <p className="muted">
        Upload historical futures prices (contract, timestamp, open, high, low, close and volume). You'll get a data quality report, suggested fixes, daily
        summaries and a price chart with VWAP.
      </p>
      {buttons}
    </section>
  );
}
