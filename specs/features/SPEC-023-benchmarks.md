---
id: SPEC-023
name: Benchmarks
status: done
created: 2026-04-23
---

# Benchmarks

## Goal
Let the user compare their own investment performance against market indexes (and other tickers) at three scopes — whole portfolio, a specific Portfolio from SPEC-022, and an individual stock — via a chart overlay (indexed to 100 at a chosen start date) and a compact stats table (p.a. return, total return, volatility). Ship with a curated list of indexes covering the user's likely interest + a free-text "add any ticker" escape hatch.

## User Stories
- As a user, I can compare my whole investment performance over the last 5 years against the S&P 500, side-by-side on a chart and in a small numbers table, so I see whether I'm keeping up with the market.
- As a user, I can compare just my "Technology" Portfolio against the NASDAQ 100, so I'm benchmarking apples-to-apples.
- As a user, I can add a ticker that isn't in the curated list (e.g. VTI, IWDA, a Czech index fund), and use it as a benchmark from then on.
- As a user, I can pick the same period selector as on the Stock page (1M / 3M / 6M / 1Y / 5Y / All), so my benchmark comparison matches the time frame I'm thinking about.

## Acceptance Criteria
- [x] Curated default benchmark list (always available, not user-editable): S&P 500, NASDAQ 100, MSCI World, FTSE 100, Euro Stoxx 50, PX (Prague Stock Exchange).
- [x] User can add additional benchmarks by ticker. Each user-added benchmark has a user-given display name (defaults to ticker) and the raw ticker for API lookup. User-added benchmarks can be edited (name only) and deleted; curated ones cannot.
- [x] Comparison scope is selectable each time the user opens the benchmark view: **whole portfolio**, **per-Portfolio** (choose one from SPEC-022), or **per-stock** (choose a stock the user holds). The selected scope defines the "my series" against which the benchmark is plotted.
- [x] Chart: a line overlay with two series — benchmark and "my series" — both indexed to 100 at the first available data point for each series. Indexing logic: `value(t) = 100 × series(t) / series(startDate)`. Hover tooltip shows the date in `dd mmm yyyy` format (e.g. "24 Apr 2025") and the indexed values for both series; x-axis tick labels use a shorter `mmm d` format.
- [x] When "my series" has no data but the benchmark does, the chart still renders the benchmark line and displays a scope-specific explanation in the legend: *"No data — assign stocks to this portfolio in the Portfolios screen first"* (portfolio scope), *"No price history available for this stock and period"* (stock scope), or *"No open positions found in any investing account"* (whole portfolio scope). For the portfolio scope this is the expected state when no tickers have been assigned to the portfolio in SPEC-022.
- [x] Compact stats table below the chart showing, for each series over the selected period: total return %, annualized (p.a.) return %, volatility (standard deviation of log returns, annualized). A note below the table states that both series are indexed to 100 — comparison shows return % only.
- [x] Period selector: 1M, 3M, 6M, 1Y, 5Y, All (aligned with SPEC-021 Stock page).
- [x] If the benchmark ticker has no series available from any SPEC-027 provider, the chart shows an empty state with a descriptive message — user can delete or swap it.
- [x] User-added benchmarks registered in Settings → Storage tab with byte count and "Delete all" action.

## UI / Screens
Benchmark comparison page (text sketch):

```
+----------------------------------------------------------+
| Benchmarks                                                |
+----------------------------------------------------------+
| Compare: (o) Whole portfolio                              |
|          ( ) Portfolio [By sector > Technology ▼]         |
|          ( ) Stock     [AAPL ▼]                           |
|                                                           |
| vs. [S&P 500 ▼]     [1M][3M][6M][1Y][5Y][All]             |
|                                                           |
|  120 +                             _/~                    |
|      |                          _/                        |
|  110 |                      _/   (my series)              |
|  100 +----_,_/~/~/.—._/~'—___________________________     |
|      |_./                (S&P 500)                        |
|   90 |                                                    |
|      +-------+-------+-------+-------+-------+            |
|       5y ago  4y      3y      2y      1y      Now         |
|                                                           |
|  Series        Total     P.a.    Volatility               |
|  My series    +58.4%    +11.2%     18.1%                  |
|  S&P 500      +62.0%    +11.9%     15.4%                  |
+----------------------------------------------------------+

Benchmarks list  [+ Add benchmark]
  · S&P 500          (curated)
  · NASDAQ 100       (curated)
  · MSCI World       (curated)
  · FTSE 100         (curated)
  · Euro Stoxx 50    (curated)
  · PX               (curated)
  · VTI              (user-added)   [Edit] [Delete]
```

Add-benchmark inline form:

```
Ticker:       [VTI        ]
Display name: [Vanguard Total Market]
                     [Cancel]   [Add]
```

## Data

`benchmarks` collection (user-added only — curated list is hardcoded in the app):

```
{
  id: string,
  ticker: string,
  displayName: string,
  createdAt: ISO timestamp
}
```

Benchmark series data is fetched on demand from SPEC-027 — not persisted in this spec.

Computation of "my series":
- Whole portfolio: weighted daily value = Σ(shares × price × fxRate) across all open positions in all investing accounts, converted to main currency using current cached FX rates. Positions whose currency pair is missing from the FX cache are skipped for that day rather than aborting the series.
- Per-Portfolio: same weighted sum, but restricted to tickers that are assigned to the selected portfolio node or any of its descendants (via SPEC-022 `portfolioAssignments`). **Requires tickers to be explicitly assigned in the Portfolios screen** — selecting a portfolio with no assignments produces no "my series" data, and the chart shows a note directing the user to assign stocks there.
- Per-stock: the stock's historical price series indexed to 100 (position size cancels in the ratio, so this is equivalent to a price-return chart starting at 100).

**Effective-start date trimming (whole-portfolio and per-portfolio scopes):** historical series for each held ticker are fetched independently and may have different start dates (e.g. a recently-listed stock has less history than the selected period). The portfolio value on any given date is the sum of all tickers that have price data on that date. If the earliest date in the union has data for only a subset of tickers, dividing by that partial value as the index denominator inflates all later values and produces a near-vertical spike in the chart. To prevent this, `computeMySeries` identifies the **effective start date** as the latest first-data-date across all tickers (i.e. the first date when every position has price coverage), then discards all earlier dates before computing the weighted sum and indexing to 100. The reported period is therefore at most as long as the shortest available ticker history; the chart always starts with full portfolio coverage.

All three scopes use current position sizes (not historical lot-by-lot reconstruction) and current FX rates (not historical). This is a deliberate MVP simplification noted in Out of Scope.

## Out of Scope
- Time-weighted vs. money-weighted return distinctions. Phase 2 uses a single straightforward return calculation over the period (total return % and annualized).
- Risk metrics beyond volatility — e.g. Sharpe, Sortino, max drawdown.
- Currency-hedged comparisons. If currencies differ, we only compare return percentages, not absolute series.
- Multiple benchmarks overlaid on the same chart. Phase 2 shows exactly one benchmark + one "my series" at a time.
- Benchmark series caching / persistence. Each open hits SPEC-027 (which has its own 1-hour cache for current prices — historical series caching is a nice-to-have for later).

## Open Questions
None.
