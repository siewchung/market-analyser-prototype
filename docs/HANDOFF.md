# Final Handoff: Futures Market Data Quality & Analytics Platform

**Version:** final design, agreed by the owner on 2026-10-27
**Status:** design complete through Phase 2. **No application code has been written.** Phase 3 (core entities and schemas) and Phase 4 (initialization and setup commands) are the first tasks.
**Audience:** the senior or principal engineer taking this from design to a working prototype.
**Context:** take-home coding exercise. It is a prototype. **Do not overengineer it.**

---

## TLDR

- Build a TypeScript app that loads historical futures bars (CSV or Parquet), validates them, computes daily OHLCV and rolling 15-minute VWAP, surfaces data quality issues, and suggests cleansing rules, through a small React dashboard.
- Data loads **automatically at startup**: the app downloads the public sample (checksum verified, skipped when already present), with a local-folder fallback. An optional **Upload files** button lets a user load their own CSV or Parquet files. **An upload replaces the active dataset. It never merges.**
- Architecture is a light ports-and-adapters layout: pure `domain`, `application` use cases and ports, `infrastructure` adapters, Fastify `delivery`. Dependencies point inward only.
- The API is a thin, read-mostly layer over one in-memory "active dataset". The only writes are upload and reset.
- Biggest data traps: minute timestamps are **not UTC**, and zero-volume bars are **intentional**. Both are handled below.
- Runs fully locally: Node and npm only. No database, cloud service, API key or Docker.
- First tasks: Phase 3 (start with the zod schemas for the API responses, because they define the entity types), then Phase 4, then the build order in section 14.

---

## 1. Source requirements

From the exercise brief (`Market_Data_Quality_Analytics_Exercise.docx`). Target users are traders, risk managers and analysts, who are business users, so the UI speaks in counts and charts, not stack traces.

| Area | Requirement | Where it is covered |
|---|---|---|
| Ingestion | Accept CSV or Parquet. Process Contract, Timestamp, Open, High, Low, Close, Volume. Handle missing values, duplicates, malformed records. | Sections 5, 6, 8 |
| Analytics | Daily OHLCV bars. Rolling 15-minute VWAP. Filter by contract and date range. | Sections 4, 10 |
| Validation | Detect missing timestamps and gaps. Identify duplicates. Flag invalid prices or volumes. Optional outliers. | Section 8 |
| Insights | Recurring quality patterns. Suggest cleansing or validation rules. Rule-based or AI-assisted. | Section 9 |
| Technical | Clean architecture, extensible design, good test coverage, edge cases. | Sections 3, 4, 12 |
| Deliverables | Working solution, README, architecture overview, UI/dashboard, unit and integration tests. | Sections 11, 12, 14, 15 |

"Accept CSV or Parquet files" is satisfied twice: automatic folder loading at startup, plus an optional upload button.

---

## 2. The dataset (verified facts)

Source: https://huggingface.co/datasets/lynx1231/historical-futures-data-sample/tree/main

**Read so far:** the repo listing, `schema.json`, `README.md`.
**Not yet read:** any actual data rows, `files.csv` (per-file row counts, date bounds, quality diagnostics and checksums per the README), `catalog.csv`, `examples/`.

- Parquet, tagged 1M to 10M rows, about 106 MB total.
- 40 contracts across 8 roots (`CL`, `ES`, `GC`, `SB`, `SR3`, `VX`, `ZC`, `ZN`), one Parquet file per contract and frequency, so roughly 80 files, in `data/daily` and `data/minute`.
- `checksums.sha256` exists in the repo and drives download verification.

### Two schemas (from `schema.json`)

- **minute:** `root_id, exchange, root, contract_symbol, timestamp_ms, timestamp_chicago_wall, trading_date, minute_of_day, open, high, low, close, volume`
- **daily:** `root_id, exchange, root, contract_symbol, timestamp_ms, date, open, high, low, close, volume, open_interest`
- Original short names are documented: `t, o, h, l, c, v, oi`. Volume is "when available", so it is nullable.

### Timestamp semantics (the main trap)

- Minute `timestamp_ms` is **not a true UTC instant**. It encodes America/Chicago wall-clock components. The dataset README says explicitly not to convert it from UTC to Chicago.
- `timestamp_chicago_wall` is a timezone-naive timestamp holding those components.
- `trading_date` is only the calendar date derived from that label. It is **not** the exchange session date.
- Daily `timestamp_ms` is a date label at 00:00:00 UTC. Negative values are valid (dates before 1970).
- **Design response:** keep the integer as is and treat it as a wall-clock label. Bucket with the UTC date functions applied to that integer, which gives the Chicago wall-clock date with no timezone library. **No timezone setting anywhere.**
- Daylight saving changes can produce a skipped or repeated label. Probably harmless for futures because markets are likely closed then (general knowledge, not verified against this data). No rule may assume labels increase strictly in real time.

### Intentional oddities

- The dataset README says long-dated and deferred contracts may contain settlement-like records with no volume and no price range, and that these are retained. So zero volume and flat bars (high equals low) are **not errors**.
- The sample is pre-normalised and may be close to clean (unverified). Planted-defect fixtures are what make the quality report demonstrable.

---

## 3. Decisions log

| Decision | Choice | Reason |
|---|---|---|
| Architecture | Ports and adapters, four folders, domain imports nothing outside itself | Brief grades clean architecture. Pure functions are cheap to unit test. |
| Bad rows | Quarantine as `RejectedRecord` (source file, row, raw values, reason). Never drop silently. | A quality tool that silently cleans hides the thing users want to see. |
| Validation | Small `QualityRule` objects run per contract, listed in one registry | Adding a rule is one file plus one registry line. This is the "extensible" answer. |
| Duplicates | Split into exact and conflicting (same contract, frequency, timestamp, different values). Keep first for analytics, report both. | Conflicting duplicates are the dangerous kind. |
| Analytics input | Exclude bars carrying an error-severity issue by default, include warning and info. Toggle via `excludeErrors`. | Bad prices must not poison VWAP. Outliers are suspicious, not provably wrong. |
| Daily bars | Group by contract and wall-clock date. Open is the first bar, close the last, high the max, low the min, volume the sum. | Matches the timestamp semantics. |
| VWAP | Time-based trailing 15-minute window per contract. Typical price `(H+L+C)/3` weighted by volume. `null` when window volume is zero. Two-pointer sliding window. | Bars are not trades, so this approximates true VWAP (say so in the README). A time-based window resets itself across breaks longer than 15 minutes. |
| Missing values | Missing open, high, low, close or timestamp: reject the record. Missing volume: keep the bar with `volume = null` and emit an info issue. | Schema marks volume "when available". |
| Storage | In-memory repository behind a port. No database. | About 106 MB total. A database pushes logic into SQL and weakens unit testing. DuckDB was considered and rejected for that reason. |
| Insights | Rule-based behind an `InsightGenerator` interface | An LLM adapter could slot in later. Do not build it now. |
| File input | Auto-load at startup, plus an optional Upload files button. **Replace, never merge.** | Owner decision. Zero-click startup, and merging would create duplicates and a misleading report. |
| Data source | Download on start with checksum verification, then local fallback | Owner decision. |
| Serving | Fastify serves the API and the built dashboard from one port. Dev uses Vite with an `/api` proxy. | One URL for a reviewer. **Proposal, not yet discussed in detail with the owner.** |

---

## 4. Architecture

```
Delivery        HTTP API (Fastify), React dashboard
   |
Application     use cases, ingestion orchestration, ports
   |
Domain          bars, VWAP, quality rules, insights (pure, no I/O)

Infrastructure  readers, repository, downloader  --implements--> application ports
```

Rules:
1. `domain` imports nothing from outside `domain`.
2. Use cases never import a concrete reader, rule or repository. They receive them through ports, the registry or the factory.
3. Only `main.ts` and `bootstrap/` know which concrete adapters exist.
4. Network access lives in one infrastructure adapter. App boot is a plain ingest of a local folder.

### The active dataset

The app holds exactly one **active dataset**: bars, rejected records, the quality report, insights and the origin. Startup builds it. Upload and reset replace it in a single step. The quality report and insights are computed once at ingest. Daily bars and VWAP are computed per request from the bars, which is cheap for one contract and a date range.

---

## 5. Directory structure

```
futures-dq/
  package.json                     # pin Node LTS in "engines"
  tsconfig.json
  vitest.config.ts
  eslint.config.js
  .env.example
  README.md                        # "Running locally" section first
  docs/ARCHITECTURE.md
  scripts/
    fetch-data.ts                  # thin CLI over the same fetcher
  src/
    main.ts                        # composition root
    bootstrap/
      resolve-data-source.ts       # resolution order, returns { dir, origin }
    domain/
      model/
        bar.ts
        rejected-record.ts
        quality-issue.ts
        insight.ts
        filters.ts
      analytics/
        daily-bars.ts
        rolling-vwap.ts
      quality/
        quality-rule.ts            # the single extension interface
        run-quality-checks.ts
        rule-registry.ts           # the one place rules are listed
        rules/
          duplicate-rule.ts
          invalid-price-rule.ts
          invalid-volume-rule.ts
          timestamp-order-rule.ts
          gap-rule.ts
          outlier-rule.ts
      insights/
        insight-generator.ts
        pattern-insights.ts
    application/
      ports/
        file-reader.port.ts
        bar-repository.port.ts
      ingestion/
        ingest-dataset.ts          # takes file paths, not a stream
        normalise-record.ts        # raw row to Bar or RejectedRecord
      queries/
        get-dataset-status.ts
        list-contracts.ts
        get-daily-bars.ts
        get-vwap.ts
        get-quality-report.ts
        get-insights.ts
    infrastructure/
      readers/
        csv-reader.ts
        parquet-reader.ts
        reader-factory.ts          # picks reader by extension
        file-discovery.ts          # finds .csv and .parquet under a folder
        column-mappers/
          minute-mapper.ts
          daily-mapper.ts
          header-aliases.ts        # t,o,h,l,c,v,oi to normalised names
      fetch/
        hf-dataset-fetcher.ts      # download, checksum verify, atomic write
      repositories/
        in-memory-bar-repository.ts
      config/
        env.ts                     # zod-validated settings
    delivery/http/
      server.ts
      error-handler.ts
      schemas.ts                   # zod request and response DTOs
      routes/
        dataset.routes.ts
        analytics.routes.ts
        quality.routes.ts
        upload.routes.ts           # POST /api/uploads, POST /api/dataset/reset
  web/                             # Vite + React + Recharts
    src/
      pages/                       # QualityReport, Analytics
      components/                  # see section 11
      api/client.ts
  tests/
    unit/                          # mirrors src/domain and src/application
    integration/
      ingest-pipeline.test.ts
      http-api.test.ts             # Fastify inject, no real port
      upload.test.ts
    fixtures/
      clean/
      demo/                        # minute/ and daily/ with planted defects
```

---

## 6. Data source resolution and fetching

The app runs the fetch itself on `npm start`. Because the app must know which source it ended up using, the fetch happens inside startup (`resolve-data-source.ts`), not as a chained npm script. `scripts/fetch-data.ts` is a thin CLI over the same fetcher.

| Step | What happens | Origin reported |
|---|---|---|
| 1 | Run the fetch against `DATA_DIR` (default `./data`), verify checksums | downloaded |
| 2 | If it fails and `LOCAL_DATA_DIR` is set and holds at least one CSV or Parquet file, use it | local folder |
| 3 | If `LOCAL_DATA_DIR` is not set but `DATA_DIR` has a previous complete download, use that | cached download |
| 4 | Otherwise exit with a message naming what failed and how to fix it | none |

Rules:
- One source per run at startup. Never merge a download with a local folder.
- The downloader never overwrites or deletes files it did not create. `LOCAL_DATA_DIR` is read-only.
- Download in parallel (4 to 6 at a time), write to a temp file, verify the checksum, then rename. A killed run must never leave a half-written Parquet file.
- Re-runs hash local files against `checksums.sha256` and fetch only missing or mismatched files. Do not skip the checksum check to save time.
- First-run download time is roughly 9 s at 100 Mbps, 17 s at 50 Mbps, 42 s at 20 Mbps, 85 s at 10 Mbps for 106 MB. This is raw transfer arithmetic. Real runs will be slower. **Not measured.**
- `npm run start:local` sets `SKIP_FETCH=1` and reads `LOCAL_DATA_DIR`. `npm run start:demo` points at `tests/fixtures/demo`. The demo path needs zero network and is the safe fallback if a reviewer's connection blocks Hugging Face. Tests never use the network.
- The resolver takes the fetcher as a parameter, so all four steps are unit-testable with a fake.
- `main.ts` ingests first, then starts the server, so a GET never sees an empty app. If load turns out to be slow, add a "loading" status later.

### Proposed configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `./data` | Download target and primary source |
| `LOCAL_DATA_DIR` | unset | Fallback folder on the user's machine |
| `SKIP_FETCH` | unset | Skip the download entirely |
| `PORT` | `3000` | HTTP port |
| `MAX_UPLOAD_MB` | to decide | Upload size limit |
| `GAP_MULTIPLIER` | to decide | Gap threshold as a multiple of the expected interval |
| `OUTLIER_THRESHOLD` | to decide | Robust z-score cutoff |

Names are proposals. Validate with zod and fail fast.

---

## 7. Ingestion pipeline

1. `file-discovery` finds `.csv` and `.parquet` files recursively.
2. `reader-factory` picks a reader by extension. Readers only produce raw records.
3. **Frequency detection:** sniff columns first (`timestamp_chicago_wall` or `minute_of_day` means minute, `open_interest` or `date` means daily). If ambiguous (short-name CSVs), use the folder or file name. If still ambiguous, reject the whole file with a message saying what to rename.
4. The column mapper converts to a canonical shape. Header aliases accept the short names `t, o, h, l, c, v, oi` as well as normalised names. **Do not go beyond that.** Arbitrary header mapping is overengineering.
5. `normalise-record` coerces types and produces a `Bar` or a `RejectedRecord`.
6. Store in the repository, run quality rules once, cache the report.

CSV specifics:
- Every field arrives as text. The normaliser must accept number, bigint and string. JS Parquet readers commonly return BigInt for 64-bit integer columns (unconfirmed for the chosen library, check when selecting it).
- Blank or non-numeric prices and ragged lines become rejects with row number and reason. The file keeps loading.
- If a CSV has no `contract_symbol`, use the filename stem and say so in the ingestion summary.
- Timestamps: use `timestamp_ms` when present. Otherwise parse a naive date-time string as a wall-clock label with the same convention. Never apply a timezone conversion.
- If the same data exists as both CSV and Parquet in one dataset, the report shows exact duplicates. That is correct. Mention it in the README.

### Draft entity shapes (to be finalised in Phase 3 as zod schemas)

```ts
type Frequency = 'minute' | 'daily';
type Severity = 'error' | 'warning' | 'info';

interface Bar {
  contract: string;            // contract_symbol, or filename stem for CSV without one
  root?: string;
  exchange?: string;
  frequency: Frequency;
  tsMs: number;                // original integer, a wall-clock label, NOT UTC for minute data
  open: number; high: number; low: number; close: number;
  volume: number | null;
  openInterest?: number | null;
  source: { file: string; row: number };
}

interface RejectedRecord {
  source: { file: string; row: number };
  reason: string;              // enumerate reject reasons in Phase 3
  raw: Record<string, unknown>;
}

interface QualityIssue {
  id: string; ruleId: string; type: string; severity: Severity;
  contract: string; tsMs?: number; endTsMs?: number;
  source?: { file: string; row: number };
  message: string; details?: Record<string, unknown>;
}
```

These are a starting point, not a contract. Phase 3 owns the final shapes.

---

## 8. Quality rules catalogue

All rules implement one interface and are listed in `rule-registry.ts`.

| Rule | Severity | Notes |
|---|---|---|
| Conflicting duplicate | error | Same contract, frequency, timestamp, different values |
| Exact duplicate | warning | Identical record repeated |
| Invalid price | error | Non-positive, high below low, open or close outside high and low |
| Negative volume | error | |
| Zero volume | info | Retained by the dataset on purpose. Contributes nothing to VWAP weighting by construction. |
| Missing volume | info | Schema marks volume "when available" |
| Flat bar (high equals low) | not flagged | Documented as normal for deferred contracts |
| Timestamp out of order | warning | Do not assume real-time monotonic labels (DST) |
| Gap | warning | Expected interval is the median delta per contract and frequency. Flag deltas beyond `GAP_MULTIPLIER` times that. |
| Return outlier | warning, optional | Robust z-score (median and MAD) on log returns |

**Open design point, gaps:** naive gap detection drowns users in false positives at session breaks and weekends. Recommended: tag a gap as an expected break when its start and end match a break pattern seen on most days, learned from the data. Simpler fallback: label weekend-length gaps as expected. Decide after looking at real minute files.

---

## 9. Insights

`InsightGenerator` takes the issues and returns insights. The rule-based implementation groups issues by contract, type, hour of day and weekday. When a type concentrates in one bucket (threshold to decide), it emits an insight with evidence (type, count, share) and a suggested rule. Intended examples (illustrative, not measured):

- Zero-volume bars cluster in deferred contracts: suggest keeping as info and excluding from VWAP.
- Gaps recur at the same time each day: suggest learning the daily break and no longer flagging it.
- Conflicting duplicates come from few contracts: suggest quarantining the later record.

No AI integration in the prototype. Mention it as an extension in the README.

---

## 10. API contract

A thin layer over the active dataset. Exact response shapes are fixed by the zod schemas in `delivery/http/schemas.ts` (Phase 3).

| Endpoint | Returns |
|---|---|
| `GET /api/dataset` | Origin (downloaded, local folder, cached download, uploaded), load time, file, contract and record counts. Feeds the header chip. |
| `GET /api/contracts` | Each contract with root, frequencies, first and last timestamp. Feeds the dropdown. |
| `GET /api/contracts/:symbol/bars/daily?from&to&excludeErrors` | Daily OHLCV rows with bar count and issue count |
| `GET /api/contracts/:symbol/vwap?date&excludeErrors` | One day of points: timestamp label, close, VWAP or `null` |
| `GET /api/quality` | Totals, counts by issue type and severity, rejects by reason |
| `GET /api/quality/issues?severity&type&contract&page&pageSize` | Paged issue log |
| `GET /api/insights` | Patterns with evidence and a suggested rule |
| `POST /api/uploads` | Multipart `.csv` or `.parquet` files. Replaces the active dataset. Returns the new dataset status plus an ingestion summary. |
| `POST /api/dataset/reset` | Re-ingests the startup source |

Behaviours:
- **Dates** are plain `YYYY-MM-DD` strings read as wall-clock dates. No timezone appears anywhere in the contract.
- **VWAP takes one day**, not a range. It keeps payloads small and matches the chart.
- **`excludeErrors`** defaults to `true`. The repository keeps the set of bars that carry an error-severity issue, so the toggle is a filter, not a recompute.
- **Pagination:** default 50, cap 200, sorted by severity then time.
- **Validation:** zod at the edge. Bad parameters return 400, an unknown contract returns 404.
- **One error shape everywhere:** `{ error: { code, message, details } }`.

### Upload flow

1. Multipart files are checked for extension and size (400 for other extensions, 413 if too large) and written to a temp folder.
2. The same `ingest-dataset` use case that runs at startup processes them. A file with an undetectable frequency is rejected with a reason and the rest proceed.
3. If nothing usable results, respond 422 and keep the previous dataset active.
4. On success, the new dataset replaces the old one in a single step, temp files are deleted, and the response carries the new status.
5. While an upload processes, GETs keep serving the old dataset. A second concurrent upload gets 409.
6. Nothing uploaded survives a restart. Reset (or a restart) returns to the startup source.

Known risk: ingest is CPU-bound in Node, so a large upload can briefly make the server unresponsive. Accept it for the prototype and note it in the README. Do not add worker threads.

---

## 11. Web UI

Two screens, mocked on a design canvas (private to the owner unless shared): https://claude.ai/artifact/KMAZ2iirrTVbCmhTS5hKkw

- **Quality report:** four counters (records read, accepted, rejected, issues), issues by type with severity colour, an insights panel, a filterable issue log. This is the centrepiece because it answers the brief's core question.
- **Analytics:** filters (contract, date range, VWAP day, exclude-errors toggle), daily candlestick chart, close versus rolling VWAP chart, daily OHLCV table. Up and down candles differ by fill, not only colour.
- **Header (both screens):** status chip showing the data origin, plus an **Upload files** button. After an upload the chip changes (for example "Uploaded files") and a "Reset to startup data" link appears. Show a confirmation that the upload replaces the current dataset.
- Component map, one hook per endpoint: `DatasetStatusChip`, `UploadButton`, `CounterCard`, `IssuesByTypeChart`, `InsightsPanel`, `IssueLogTable`, `FilterBar`, `DailyCandleChart`, `VwapChart`, `DailyBarsTable`.
- Light theme. Touch targets at least 44 px. Use real `button`, `label` and `table` elements.

### Mockup corrections to apply when building (the mockup itself is not final)

1. The nav has an **Overview** link that goes nowhere. Remove it, since only two screens exist.
2. The header says "40 contracts, minute data". The app ingests minute and daily files, so show real counts from `GET /api/dataset`.
3. The issue log column says "Chicago wall clock". That is right for minute bars. Daily records are date labels, so the label should adapt by frequency.
4. The "Mock data" tag belongs in the mockup only. The real app always loads data before serving.
5. All numbers and contract symbols in the mockup are illustrative.

---

## 12. Testing strategy

- **Unit (Vitest):** every rule, daily bars, VWAP (zero-volume windows, window boundaries, a break longer than 15 minutes), normaliser (number, bigint, string, blank), column mappers and aliases, frequency detection, the data source resolver with a fake fetcher (all four steps).
- **Integration:** a fixture folder in, a full report out, with exact expected issue counts. Run the same defects through CSV and Parquet to prove both readers feed one pipeline. HTTP tests use Fastify `inject`.
- **Upload:** post multipart CSV and Parquet fixtures. Assert the active dataset is replaced, other extensions are rejected (400), oversize is rejected (413), an unusable upload returns 422 and leaves the old dataset, a concurrent second upload returns 409, and reset restores the startup data.
- **Fixtures:** `defects.csv` is hand-editable so a reviewer can open it and see the planted problems (duplicates, conflicting duplicates, bad prices, negative volume, out-of-order timestamps, a gap, a junk row). A small generated Parquet fixture mirrors it.
- Tests never use the network.

---

## 13. Running locally

Everything runs on one machine. Node and npm only. No database, cloud service, API key or Docker. This is the design intent. **It has not been run.**

```
npm install
npm run build      # builds the React dashboard
npm start          # downloads data if needed, ingests, serves on :3000
```

- Fastify serves the built dashboard and the API from one port.
- `npm run dev` runs the API and the Vite dev server together, with Vite proxying `/api` to the backend (proposal).
- Offline: `npm run start:local` (with `LOCAL_DATA_DIR`) or `npm run start:demo` (committed fixtures, zero network).
- Put a "Running locally" section at the top of the README with exactly these commands.
- Memory: if Node runs out of heap on the full sample, `NODE_OPTIONS=--max-old-space-size=4096` is the quick fix. Columnar storage inside the repository is the real fix, with no change above the port.
- Pin a Node LTS in `package.json` `engines`. Use `path.resolve` for all paths so Windows and Mac both work. Test on whichever the owner uses.

---

## 14. Suggested build order (vertical slices, test first)

1. Scaffold: `package.json`, `tsconfig`, Vitest, ESLint, `.env.example`, zod config.
2. Phase 3: zod schemas for entities and API responses.
3. Domain model and the first rules with unit tests.
4. Normaliser, column mappers, header aliases, CSV reader, with `defects.csv`.
5. Parquet reader and generated fixture.
6. Daily bars and VWAP.
7. Quality runner, registry, remaining rules.
8. Insights.
9. In-memory repository, `ingest-dataset`, file discovery.
10. Fetcher and `resolve-data-source`.
11. Fastify API, upload and reset, with integration tests.
12. React dashboard (apply the mockup corrections in section 11).
13. README (running locally first, decisions, limitations, VWAP approximation, duplicate note) and `docs/ARCHITECTURE.md` (layer diagram, rule catalogue, trade-offs, scaling path).

**Scaling path for the architecture doc:** `BarRepository` is the seam. DuckDB is the natural swap for analytical queries straight over Parquet. Postgres or TimescaleDB would be the production choice for persistence and concurrent users.

**Definition of done:** tests pass, type check and lint clean, `start:demo` works offline with a non-empty quality report, README and architecture doc written, and anything not run is stated explicitly.

---

## 15. Proposed stack (versions not yet confirmed)

TypeScript, Node (current LTS), `csv-parse`, a pure-JS Parquet reader (`hyparquet` is the leading candidate, unconfirmed), Fastify with its multipart and static plugins, zod, Vitest, ESLint, Vite, React, Recharts. Prefer dependencies without native builds so the reviewer can run it anywhere. Check the chosen Parquet library's BigInt handling and its behaviour on large files before committing to it. Pick versions in Phase 4 and confirm them against current releases.

---

## 16. Known risks and unverified assumptions

- Actual Parquet column types, null handling and BigInt behaviour are unconfirmed. No data rows have been read.
- `files.csv` column names are unknown. Write the fetcher after reading it. Its diagnostics could also serve as an oracle for integration tests.
- Hugging Face download mechanics (resolve URL pattern, rate limits, large file handling) are untested. The repo uses xet storage. The design environment could not reach Hugging Face for downloads, so the first real run is the first test.
- Load time, ingest speed and memory use are unmeasured. An object per bar at the upper end of 1M to 10M rows is a risk.
- DST behaviour and session-break handling for gap detection need a look at real minute files.
- The sample may be nearly clean, so the quality report could look empty without the demo fixtures.
- Upload replaces rather than merges. Users may expect to add files. Make the chip and the confirmation message explicit.
- A large upload can briefly block the Node event loop.
- VWAP from bars approximates trade-level VWAP.
- The Vite proxy and single-port serving setup have not been discussed in detail with the owner.

## 17. Open questions

1. Gap handling: learned break pattern or weekend-only label (section 8)?
2. Concentration threshold for insights.
3. Should daily files also reconcile against daily bars aggregated from minute data? Stretch goal, not core.
4. `fetch-data` as a CLI plus startup step (current plan) or startup only?
5. Upload size limit value.

---

## 18. How the owner likes to work

- Plan first for non-trivial changes. Show a draft before polishing.
- Ask one sharp question when blocked. Do not guess.
- Take a position and push back when you disagree.
- Scope discipline: flag adjacent issues, do not silently expand scope.
- Verify before declaring done (tests, type check, lint) and say what was not run.
- New commits instead of amending. No force-push to main. Do not skip hooks.
- Short sentences. Every claim needs a source or a caveat.

---

## 19. References

- Exercise brief: `Market_Data_Quality_Analytics_Exercise.docx`
- Dataset: https://huggingface.co/datasets/lynx1231/historical-futures-data-sample/tree/main
- Schema: https://huggingface.co/datasets/lynx1231/historical-futures-data-sample/resolve/main/schema.json
- Dataset README: https://huggingface.co/datasets/lynx1231/historical-futures-data-sample/resolve/main/README.md
- UI mockup: https://claude.ai/artifact/KMAZ2iirrTVbCmhTS5hKkw
