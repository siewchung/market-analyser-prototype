# A beginner's walkthrough

This guide is for people who are new to finance. It follows one contract, ESZ25, through all three screens of the app and explains what you're looking at as you go. Every number below is from the built-in sample, so you can check it on screen.

You don't need to read the README first. If a term is unfamiliar, the [jargon buster](../README.md#jargon-buster) has short definitions.

## Before you start: five ideas

**1. A futures contract is a deal for a future date.** Two parties agree today on a price for something to be delivered later. People trade these contracts to bet on prices, or to protect themselves against price moves.

**2. Each delivery month is its own contract.** The name tells you which one. ESZ25 breaks down like this:

| Part | Meaning |
|---|---|
| `ES` | The product (the "root"): S&P 500 futures, an index of large US companies |
| `Z` | The delivery month: December |
| `25` | The year: 2025 |

The month letters are F Jan, G Feb, H Mar, J Apr, K May, M Jun, N Jul, Q Aug, U Sep, V Oct, X Nov, Z Dec. So ZNH26 is the 10-year US Treasury note future for March 2026.

The sample has 8 products: CL (crude oil), ES (S&P 500), GC (gold), SB (sugar), SR3 (SOFR, a US interest rate), VX (VIX, a measure of market nervousness), ZC (corn) and ZN (10-year US Treasury notes). Each has 5 contracts, for 40 in total.

**3. Prices come as bars.** A bar sums up one period, here either one minute or one day, in five numbers:

| Number | Meaning |
|---|---|
| Open | The first price in the period |
| High | The highest price |
| Low | The lowest price |
| Close | The last price |
| Volume | How many contracts changed hands |

People call this **OHLCV**. Almost every chart and calculation in trading is built from bars.

**4. Bad data spreads.** If one bar has a wrong price, every average, chart and risk number built on it is wrong too, often without anyone noticing. That's why the app checks the data before showing any market numbers.

**5. The trading day starts the evening before.** These markets trade nearly 24 hours a day. The day's session opens at 5pm Chicago time and runs until 4pm the next afternoon, so trading on Sunday evening counts towards Monday. All times in the app are Chicago time, because that's where the exchange is.

## Step 1: Overview. Can I trust this data?

Open the app. It lands on **Overview**, with the sample already loaded.

**Active dataset** tells you what's loaded: 80 files (40 minute, 40 daily), 40 contracts across 8 roots, and about 5.3 million records.

**Data health** is the headline. It says **99.9%** of records are usable for analytics. Below that are three counts:

| Severity | Count | What it means |
|---|---|---|
| Error | 43 | Definitely wrong. Left out of the market numbers. |
| Warning | 347,614 | Suspicious. Worth a look, but kept. |
| Info | 12,841 | Normal for this kind of data. No action needed. |

A large warning count doesn't mean the data is bad. You'll see why in step 2.

**What to fix first** shows the two most serious patterns. **Contracts** lists every contract. Find ESZ25: its data runs from 2021-06-04 to 2025-12-19, with 114,477 minute bars.

## Step 2: Quality. What's wrong, and what should we do?

Click the **Quality** tab.

**Start with the Insights panel, not the issue log.** The issue log lists problems one by one, and there are hundreds of thousands. Insights group them into patterns and suggest a rule for each. That's the part you can act on. The top one reads:

> **41 bars with an impossible price: close outside the high-low range**
> Suggested rule: Require low <= close <= high on every bar.

A bar's close can't be higher than its high or lower than its low, by definition. So something upstream wrote these bars wrongly. The suggested rule is a check the data supplier, or our loading process, could add to stop it happening.

**Issues by type** explains the big warning count. Almost all of it is **data gaps**: minutes with no bar while the market was open. Click **Show all** under the insights and look for ESZ25:

> **ESZ25: 4,376 gaps spread across the trading day**
> Suggested rule: Treat quiet minutes as expected for ESZ25: raise its gap threshold, or carry the last price forward for analytics instead of alerting.

"Spread across the trading day" is the clue. If a data feed broke, the gaps would bunch together at one time. Spread out, they usually mean nobody traded that minute. That's common for a contract that's still far from its delivery date, because most trading happens in the nearest contract. So these are mostly quiet periods, not faults.

**Info** findings are mostly "flat bars, no trades": nothing traded and the price didn't move. For contracts far from delivery, the exchange often still publishes an official end-of-day price, called a **settlement price**. These rows are expected, which is why they're Info and not Error.

**The issue log** is the evidence. Click **Errors** to see just the 43 errors, each with its contract, date and detail. For daily data the time column shows a date only, because a daily bar has no time of day.

## Step 3: Analytics. What did the market do?

Go back to **Overview** and click **Analytics** on the ESZ25 row. (Or open the Analytics tab and pick ESZ25 from the Contract list.)

> Minute data isn't in the repo. If you see "Minute data for ESZ25 isn't downloaded", run `npm run download-dataset` once, then reload. Until then you'll see daily bars only.

### Daily OHLC (the candle chart)

Each candle is one trading day.

- The **thin line** (the wick) runs from the day's low to its high.
- The **box** (the body) runs from the open to the close.
- A **hollow green** candle closed higher than it opened: the price went up that day.
- A **solid red** candle closed lower than it opened: the price went down.

Tall candles mean big moves within the day. Short ones mean a calm day.

### Daily bars (the table)

The same days as numbers, newest first. Take 2025-12-12:

| Open | High | Low | Close | Volume | Bars | Issues |
|---|---|---|---|---|---|---|
| 6,914.00 | 6,915.50 | 6,805.00 | 6,833.50 | 1,811,135 | 1,380 | 3 |

Reading it: the day opened at 6,914.00 and closed lower at 6,833.50, so its candle is solid red. The price never went above 6,915.50 or below 6,805.00. About 1.8 million contracts traded.

**Bars: 1,380** is a useful sanity check. The session runs 23 hours, from 5pm to 4pm, and 23 × 60 = 1,380 minutes. A full day has one bar per minute. A much lower number means a short day (around a holiday, say) or missing data. **Issues: 3** tells you the quality checks found three things on that day. The Quality screen has the detail.

### Rolling 15-minute VWAP

VWAP means **volume-weighted average price**. It's the average price over the last 15 minutes, where prices that more contracts traded at count for more. Traders treat it as the "fair" price for that stretch of time.

The chart shows two lines for one day:

- **Close** (grey, solid): the price minute by minute.
- **VWAP** (blue, dashed): the 15-minute average. It's smoother and lags behind.

When the price is above VWAP, recent buying has pushed it up. Below, selling has pushed it down. Use the **VWAP day** list to pick another day.

The chart opens on 2025-12-19, ESZ25's last day, and the lines stop at 08:29. That's the contract expiring: trading stops that morning, and the market moves on to the next contract, ESH26.

### Exclude bars with errors

This box is ticked by default, so bars with errors (like the impossible prices from step 2) are left out of the charts and table. Untick it to see what those bars would do to the numbers. It's a quick way to show someone why the bad bars matter.

## Step 4: Try it on messy data

The sample is fairly clean. To see the app catch everything, upload a file with problems planted in it:

1. Click **Upload files** and choose `tests/fixtures/dirty.csv`.
2. Confirm. The upload replaces the sample until you reset.
3. Open **Quality**. You'll see 5 rejected rows, plus duplicates, impossible prices, bad volumes, out-of-order rows, gaps and unusual price moves. Click the **Rejected** card to see the rows that couldn't be read, and why.
4. Click **Reset to startup data** in the header to go back to the sample.

## What to take away

- Check the data before trusting any number built on it. Overview tells you in one glance.
- Read insights, not individual issues. Patterns tell you what to fix and which rule to add.
- A big warning count isn't always bad news. Look at how the issues are spread before deciding.
- Bar counts and dates are cheap sanity checks. A day with 1,380 minute bars is complete. One with 503 probably isn't.
