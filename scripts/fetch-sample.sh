#!/usr/bin/env bash
# Downloads two real contract files from the public Hugging Face sample into tests/fixtures.
# Run once with `npm run fetch-sample`; the files are committed so tests also work offline.
set -euo pipefail
BASE="https://huggingface.co/datasets/lynx1231/historical-futures-data-sample/resolve/main/data"
OUT="$(dirname "$0")/../tests/fixtures"
mkdir -p "$OUT"
curl -fsSL "$BASE/daily/CBOT/ZN/ZNH26.parquet" -o "$OUT/sample-daily.parquet"
curl -fsSL "$BASE/minute/CBOT/ZN/ZNH26.parquet" -o "$OUT/sample-minute.parquet"
echo "Saved sample files to $OUT"
