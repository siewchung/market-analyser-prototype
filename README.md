# Futures Data Analyser

A simple web app that checks historical futures market data for problems and turns it into easy-to-read market views.

You give it a data file. It tells you:

- **Can I trust this data?** It gives a clear verdict, then shows exactly what's wrong: missing data, duplicates, impossible prices and other errors.
- **Why is it wrong, and what should we do about it?** It spots recurring patterns and suggests a rule to fix or prevent each one.
- **What did the market do?** It shows daily price summaries and an intraday price chart with a 15-minute average trading price (VWAP).

It's built for the people who use and look after market data: traders, risk managers and analysts.

Your file never leaves your computer. All the work happens inside your web browser.

> This is a prototype built for a coding exercise (brief in [`docs/`](docs/)). It's deliberately simple.

---

## Using the app

### 1. Load some data

Click **Upload CSV or Parquet file** and choose a file. You can also click one of the two samples:

- **Messy CSV sample.** A small made-up file with every kind of problem planted in it. It's the quickest way to see what the app can catch.
- **Real ZN minute data.** About 97,000 one-minute price records for the 10-year US Treasury note future, from a [public sample dataset](https://huggingface.co/datasets/lynx1231/historical-futures-data-sample).

Your file needs a column for each of these: contract, timestamp, open, high, low, close. A volume column is optional. Common column names are recognised automatically, so "Contract", "contract_symbol" and "Symbol" all work.

### 2. Read the results

The page has three sections. Use the links in the black bar at the top to jump between them.

**Data health: can I use this data?**

| Part | What it tells you |
|---|---|
| **Verdict** | A one-line answer: **Good to use** (green), **Usable with caveats** (amber) or **Needs attention** (red, when less than 95% of rows are usable). |
| **Summary cards** | The share of rows you can use, rows that couldn't be read, the contracts and the dates covered. Then one card per quality check: "Passed" in green, or the number of problems found. |
| **By contract** | The same picture for each contract, so you can see which ones are fine and which aren't. Only shown when the file has more than one contract. |
| **Insights & suggested rules** | The most useful part. Instead of thousands of individual warnings, it explains the patterns behind them and suggests what to do. The five most serious are shown first; click **Show all** for the rest. |

**Market view: what did the market do?**

| Part | What it tells you |
|---|---|
| **Filters** | Narrow the chart, daily bars and issue log to one contract and/or a date range. |
| **Price chart** | Closing price with the 15-minute VWAP overlaid, for one contract. It opens on the latest day with at least an hour of trading. Use **Previous day** / **Next day** to step through days, or set From and To for a longer period. |
| **Daily bars** | One row per contract per trading day: open, high, low, close and total volume. |

**Issue log: exactly what's wrong, and where?**

| Part | What it tells you |
|---|---|
| **Quality issues** | Every problem found, most serious first, with its row number in your file. For a CSV, this is the same row number you'd see in Excel. Click a type, such as **Data gaps**, to see only that type. |
| **Rejected rows** | Rows that couldn't be read at all, why, and what they originally contained. Empty cells are marked in red. |

All times are shown in **Chicago time (CT)**, the exchange's own time zone, exactly as they appear in the source data.

### What the app checks for

| Problem | How serious | In plain terms |
|---|---|---|
| Rejected row | Error | Missing contract or price, or a timestamp that can't be read. The row is left out entirely. |
| Conflicting duplicates | Error | The same minute was sent twice with different numbers. Which one is right? |
| Impossible prices | Error | A price of zero or below, or a high that's lower than the low. |
| Exact duplicates | Warning | The same row sent twice. Harmless once removed, but a sign of a loading problem. |
| Bad volume | Warning | Volume that's missing, negative, or not a whole number of contracts. |
| Data gaps | Warning | A stretch of time with no data while the market was open. The normal daily break and weekends aren't counted. |
| Out of order | Warning | A row that's earlier in time than the one above it. |
| Unusual price moves | Warning | A price jump much bigger than normal for that contract (more than 10 times the typical move). |
| Flat bars, no trades | Info | Nothing traded and the price didn't move. This is usually a settlement price, not an error. |

### How problems affect the numbers

- **The verdict, summary cards and insights always cover the whole file**, whatever filters you choose.
- **The chart and daily bars use a cleaned-up copy of the data:**
  - Rejected rows and impossible prices are left out.
  - If a row is duplicated, the first one is kept.
  - Negative volume is treated as missing.

### Jargon buster

| Term | Meaning |
|---|---|
| **Futures contract** | An agreement to buy or sell something at a set date. Each delivery month is a separate contract, e.g. ZNH26 = 10-year Treasury note, March 2026. |
| **OHLCV** | Open, High, Low, Close, Volume: the five numbers that describe trading over a period. |
| **Bar** | One period's OHLCV, e.g. one minute or one day. |
| **Volume** | How many contracts traded. |
| **VWAP** | Volume-weighted average price: the average price over a period, where prices with more trading count more. Here it's calculated over the last 15 minutes, updated every minute. |
| **Trading day** | Futures trading for a day starts at 5pm Chicago time the evening before. So Sunday evening's trading counts towards Monday. |
| **Settlement price** | The official end-of-day price set by the exchange, sometimes published even when nothing traded. |
| **CSV / Parquet** | Two common file formats for tables of data. CSV opens in Excel; Parquet is a compact format used by data teams. |

---

## Known limitations

- **Public holidays aren't known to the app.** A missing day of data on a holiday is flagged as a gap. The insights point out that missing weekdays are probably holidays.
- **Market hours assume the main CME electronic schedule.** Products with different hours will show gaps at their regular closed times. The insights spot these and suggest checking the product's trading schedule.
- **Prices are shown as decimals.** Treasury traders usually quote ZN in 32nds of a point (e.g. 112-08+). Here it's shown as 112.250000, because ZN trades in 1/64ths of a point and needs 6 decimals to be exact.
- **Long chart periods are simplified to 2,000 points** so the chart stays fast. Very brief spikes can disappear from the chart, but they're still in the issue list. A single day of minute data is never simplified.
- **The issue log shows the 1,000 most serious problems** for the chosen type. The counts are always complete.
- **Blank lines in a CSV shift the row numbers.** After a blank line, row numbers are one lower than the line in Excel.
- **Thresholds are fixed:** gaps over 5 minutes, price moves over 10 times normal, a 15-minute VWAP, and the 95% usable-rows line for the verdict. They can be changed in code, but not yet in the app.
- **Daily figures won't exactly match the vendor's own daily file.** In the sample dataset, the minute data contains only about 76% of the volume reported in the daily data (107.3M vs 140.6M contracts for ZNH26, per the dataset's `files.csv`). Daily highs and lows match the vendor's on 62% of days.

## Next steps

These are ideas raised during review that were deliberately left out of the prototype:

- **Export.** Download the issue log and the cleaned data as CSV.
- **Exchange holiday calendar.** Stop flagging holidays as gaps.
- **Per-product settings.** Trading hours, and price formats such as 32nds for Treasuries.
- **Editable thresholds** in the app.
- **More daily columns.** Change, % change and daily range.
- **AI-written explanations** alongside the rule-based insights.

---

## For developers

### Run it

Tested on Node 26.

```bash
npm install
npm run dev        # then open the URL it prints (usually http://localhost:5173)
```

To share it with business users without them installing anything, run `npm run build`. Then host the `dist/` folder on any static web host. There's no server to run.

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm test` | Run all unit and integration tests |
| `npm run typecheck` | TypeScript strict-mode check |
| `npm run build` | Type check, then build a static site into `dist/` |
| `npm run fetch-sample` | Re-download the sample Parquet files into `tests/fixtures/` |

### Key technical decisions

- **Timestamps stay in Chicago wall-clock time.** The source stores them that way and warns against converting them ([dataset README](https://huggingface.co/datasets/lynx1231/historical-futures-data-sample)). Internally they're read with `getUTC*` so the viewer's timezone and daylight saving can't shift them.
- **Trading day = CME session.** Bars from 17:00 CT onwards go to the next day. The dataset's own `trading_date` column is the calendar date, so it's ignored. Against the vendor's daily file, the session rule matches daily high and low on 62% of days, versus 26% for calendar dates. An integration test pins this.
- **The VWAP window is (t − 15 min, t]**, using typical price (H+L+C)/3. If nothing traded in the window, the result is `null`. It's calculated on the full history before filtering, so the edges of a date range are correct.
- **The chart defaults to one day.** A 15-minute VWAP is an intraday measure; months of minute data in one chart hide it. With no date filter, the chart opens on the latest day with at least 60 bars. The very latest day can be nearly empty, e.g. for an expiring contract.
- **Filters and view options are separate.** `Filter` (contract, dates) changes what's analysed in the market view and issue log. `ViewOptions` (chart day, issue type) only changes what's displayed, so stepping the chart through days doesn't shrink the daily table.
- **Quality checks run once on the whole file.** Filters only change the view.
- **No backend and no database.** Files are a few hundred thousand rows at most, which plain TypeScript in a Web Worker handles in under a second. It also keeps every rule typed and unit-testable. DuckDB-WASM could replace the internals of `load()` and `query()` later without touching the UI.
- **Insights are rule-based, not AI.** They're deterministic, testable and need no API key. An LLM step could be added behind the same `Insight` type.

### Testing

- 106 tests, all pure Node (no browser needed).
- Unit tests cover every domain module and the display formatters.
- Integration tests run real file bytes through the full pipeline:
  - Exact counts for every problem planted in `dirty.csv`, including Excel-matching row numbers.
  - Real ZN data: minute volume adds up to the vendor's reported total of 107,312,444.
  - Daily bars line up with the vendor's daily file on most days.
  - The chart opens on an active day.
- The UI was checked by driving the running app in headless Chrome at desktop (1280px) and phone (390px) widths. It has no automated UI tests.

### Project layout

```
src/domain/          business rules: pure TypeScript, no browser or file-format code
src/application/     load() and query(): the two use cases
src/infrastructure/  CSV/Parquet parsers and the background worker
src/ui/              React components
tests/               unit tests (mirroring src/), integration tests, sample files
```

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how the pieces fit together and how to extend them: new checks, insight rules and file formats.
