# Session summary: Futures Data Analyser prototype

Date: 25 Oct 2026
Repo: https://github.com/siewchung/market-analyser-prototype (private)

## What we built

A browser-only web app for the coding exercise in `docs/Market_Data_Quality_Analytics_Exercise.docx`. It loads futures OHLCV data from CSV or Parquet, then:

- checks data quality and gives a plain verdict (good / caveats / needs attention),
- explains recurring problems and suggests a cleansing rule for each,
- shows daily OHLCV bars and an intraday price chart with a rolling 15-minute VWAP,
- filters by contract and date range.

Files never leave the user's computer.

## Key decisions (and why)

| Decision | Why |
|---|---|
| TypeScript only: Vite + React, no backend | The user's stack and a minimal-code brief. |
| Parsing and analysis run in a Web Worker | The page stays responsive on large files and on mobile. |
| No DuckDB | Files are about 100–200k rows, so plain TS handles them fast. The logic stays typed and unit-testable, and tests and browser share one runtime. |
| Rule-based insights, not AI | Deterministic and testable, and no API key needed. |
| Timestamps kept as Chicago wall-clock time | The dataset stores them that way and warns against converting them. |
| Trading day = CME session (bars at or after 17:00 CT go to the next day) | The dataset's `trading_date` turned out to be the calendar date. The session rule matches the vendor's daily high/low on 62% of days, versus 26% for calendar dates. |
| Quality checks always cover the whole file; filters only change the view | Stops counts shifting and gaps hiding at filter edges. |
| Chart defaults to the latest day with at least an hour of trading | A 15-minute VWAP only means something at intraday zoom. The very last day of an expiring contract is almost empty. |
| `Filter` and `ViewOptions` kept separate | Stepping the chart through days doesn't shrink the daily table. |
| Business-style white theme inspired by macquarie.com.au | The user asked for it. Colours only: no Macquarie logo, name or proprietary font. |

## How it's structured

- `src/domain/`: pure business rules (normalise, 7 quality checks, clean, daily bars, VWAP, insights, health verdict).
- `src/application/analyse.ts`: `load()` once per file, `query()` per filter or view change.
- `src/infrastructure/`: CSV/Parquet parsers and the worker.
- `src/ui/`: React components.
- Docs: `README.md` (business-first, then developer section, with a "How it works" diagram) and `docs/ARCHITECTURE.md`.

## How it was verified

- **106 tests (unit and integration), all passing.**
  - Every problem planted in `tests/fixtures/dirty.csv` is counted exactly, with Excel-matching row numbers.
  - On real ZN data, minute volume adds up to the vendor's reported total of 107,312,444.
  - Daily bars line up with the vendor's daily file on most days.
- **Type check and production build are clean.**
- **GitHub Actions CI** runs the type check, tests and build on every push and pull request. It's green.
- **UI checked by driving the real app in headless Chrome** at desktop (1280px) and phone (390px) widths, with no console errors. There are no automated UI tests.

## Things found and fixed along the way

- **Sample Parquet files are ZSTD-compressed.** Added `hyparquet-compressors`.
- **Wrong trading day.** The dataset's `trading_date` column is the calendar date, which created 30 one-bar "Sunday" days. Switched to the CME session rule.
- **Phone layout overflowed** to 997px because a wide table stretched the page. Fixed.
- **Outlier baseline** broke on tick-sized price moves. Changed to the median absolute move.
- **Wrong or awkward insight text** found by reading the output ("1 row have…", and fractional volume wrongly said to count as zero). Fixed.
- **CSV row numbers were off by one** against Excel. Fixed.
- **Chart opened on a near-empty last day** for an expiring contract. Now opens on the latest active day.
- **Warning orange and "Passed" green failed contrast standards** for small text. Darkened.
- **Inconsistent short month names** in browser date formats ("July", "Sept"). Replaced with a fixed list.
- **README diagram labels** ("1. Read") were rendered as list syntax. Renamed to "Step 1: Read".
- **Commits were attributed to `sc-bilue`** because of the global work email. Set the repo's email to the `siewchung` no-reply address. The first two commits were rewritten and force-pushed with explicit approval.

## Commits on `main`

| Commit | What |
|---|---|
| `bf1bd41` | The prototype |
| `fd2c286` | GitHub Actions CI |
| `507d8ac` | README "How it works" diagram and architecture link |

## Known limitations

- Exchange holidays aren't modelled, so they show as gaps. The insights point this out.
- The session calendar assumes CME Globex hours. Products like grains show recurring gaps, which the insights flag.
- Prices show as decimals. ZN traders would expect 32nds.
- One file at a time.
- Daily files: the chart opens on a single point. Set From/To to see the whole history.
- Untested on the largest files (SOFR SR3H26/SR3M26, about 680k rows).

## Next steps (parked)

- **Small fix:** show the full range on the chart when the data is daily.
- **Export:** issue log and cleaned data as CSV.
- **Exchange holiday calendar.**
- **Per-product settings:** trading hours, and price formats such as 32nds.
- **Editable thresholds** in the app.
- **More daily columns:** change, % change and range.
- **Optional AI-written explanations** alongside the rule-based insights.
- **Performance check** on the 680k-row SOFR files.

## Picking up again

```bash
cd /Users/scchong/Misc/BA/tba-market-analyser
npm install      # only if node_modules is missing
npm run dev      # http://localhost:5173
npm test
```

Sample data: https://huggingface.co/datasets/lynx1231/historical-futures-data-sample. Download any `data/minute/.../*.parquet` file and upload it in the app.
