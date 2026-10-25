# CLAUDE.md

Futures data quality and analytics prototype for a coding exercise (brief in `docs/`).
What it does: `README.md`. How it's built: `docs/ARCHITECTURE.md`. Read those before changing behaviour.

## Decisions already made (don't relitigate without asking)

- TypeScript, Vite + React, no backend. Parsing and analysis run in a Web Worker.
- No DuckDB or other database. Files are small enough to analyse in plain TS, and the logic stays typed and unit-tested.
- Insights are rule-based (`src/domain/insights/rules.ts`), no AI.
- One file per analysis. Loading the whole dataset at once was considered and dropped as out of scope.
- It's a prototype. Push back on new infrastructure (state libraries, API layers, databases).

## Data

- `npm run download-dataset` pulls the full Hugging Face sample (80 parquet files, ~100 MB) into `sample-data/` (gitignored).
  A checksum warning on `README.md` and `dataset.json` is expected: the publisher's checksum list is stale for those two.
- `tests/fixtures/` holds the small committed files the tests use (`npm run fetch-sample` refreshes the ZN ones).
- The app handles both daily and minute files. Don't assume minute-only.

## Conventions that are easy to break

- Timestamps are Chicago wall-clock stored as if UTC. Always read them with `getUTC*` (see the note in `src/domain/types.ts`).
- The trading date is derived from the timestamp (CME session: 17:00 CT onward counts as the next day).
  The dataset's own `trading_date` column is a calendar date and is ignored on purpose.
- Domain code (`src/domain`) is pure: no DOM, no I/O.
- Comments are written so a junior developer or business user can follow them.

## Before calling anything done

- `npm run typecheck` and `npm test`.
- `scripts/` is not covered by `npm run typecheck` (tsconfig only includes `src` and `tests`). Check script changes separately.
