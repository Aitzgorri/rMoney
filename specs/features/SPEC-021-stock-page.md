---
id: SPEC-021
name: Stock Page
status: in-progress
created: 2026-04-23
---

# Stock Page

## Goal
Give the user a focused page per stock showing: latest price, a price chart over selectable time periods, all the user's transactions on that stock (buys, sells, transfers, splits, dividends with a type filter), dividend history and next 4 projections (from SPEC-020), return metrics (total, per annum, split into price-appreciation vs dividend components), the top 5 latest news items, and a persistent **AI chat panel** anchored on the right column that uses the per-user AI connection (SPEC-026).

## User Stories
- As a user, I can open a stock page from any list of positions (investing-account detail, portfolio detail, reports) and see everything about my position on that stock in one place.
- As a user, I can switch time periods on the price chart (1D / 1W / 1M / 3M / 6M / 1Y / 5Y / All) to see the shape I care about.
- As a user holding a stock that trades on multiple exchanges, I can see which exchange the page is showing data for, with a default of the exchange where I've invested the most, and I can click through to see the same stock's data on a different exchange.
- As a user, I can filter the transactions list by type (buys, sells, transfers, splits, dividends) to cut through the noise.
- As a user, I can see the total return on this stock broken into price-appreciation and dividend components, both as a sum and as a percentage of my invested amount, so I understand where my returns came from.
- As a user, I can hold a conversation with the AI about the stock from a panel on the right side of the page; if I haven't configured an AI connection, the same panel shows a placeholder linking me to Settings (so the layout never shifts based on whether AI is enabled).

## Acceptance Criteria
- [ ] Page header shows: stock name, ticker, currency of the current stock-exchange selection, latest price (refreshed on page load via SPEC-027). *(Price and exchange selector deferred to SPEC-027)*
- [ ] Stock-exchange selector. *(Deferred to SPEC-027)*
- [x] Price chart with a period selector: **1D**, 1M, 3M, 6M, 1Y, 5Y, All. *(Phase 28e)* 1D calls `getIntradaySeries` (1-min bars, 5-min hot cache); button is disabled with a tooltip when all providers return unsupported for that ticker. X-axis labels show HH:mm times; hover tooltip shows locale time. 1W deferred.
- [x] Metrics row (market value, total return + %, p.a. return, price-appreciation, dividend return, dividend yield TTM). Exchange rates auto-loaded on mount; values show — when rates unavailable.
- [x] **Metrics row overhaul (Phase 28b):** TTM yield sourced from `apiDividendHistory` per-share amounts (falls back to user record `dividendPerShare` for dates the API hasn't covered). Forward yield = last-regular-per-share × frequency multiplier ÷ price; uses `detectEffectiveDividendFrequency`; shows "—" when frequency unknown or no regular history. Dividend return splits into two tiles: all-time net (after tax) and last-12-months net (after tax). P.a. return rebuilt as XIRR (Newton-Raphson over buy/sell/dividend/terminal-MV cash flows in main currency; buy/sell use snapshot FX rates from Phase 25a, falling back to live rate when no snapshot is present; shows "—" only when both the snapshot and live rate are unavailable).
- [x] **Yield-on-cost tiles (Phase 28b follow-up):** Each yield is shown twice — `TTM yield` and `Fwd yield` use the **current price** as the denominator; `TTM on cost` and `Fwd on cost` use the **weighted-average fee-inclusive cost per share** (`Σ(shares × avgCost) / Σ(shares)` across all open positions). Yield-on-cost answers "what return am I currently earning on what I originally paid?" — independent of subsequent price movement. The four yield tiles share a narrower layout (`metricTileNarrow`).
- [x] **Info popups on yield tiles:** Each yield tile carries an "ⓘ" button. Clicking opens a `YieldDetailDialog` showing the exact records and arithmetic — for TTM, the full list of dividends in the past 12 months (date, type regular/special, source API/user, per-share); for Forward, the single most-recent regular payout used and its source. The denominator is shown explicitly (current price or avg cost), followed by the formula and the result to 4 decimals.
- [x] **Total return formula correction (Phase 28b follow-up):** `totalReturn = (MV − totalInvested) + netDividends`. Earlier behaviour omitted the dividend component, understating total return and making the price-appreciation tile produce a negative-tilted figure. After the fix `priceAppreciation = MV − totalInvested` and `totalReturn − priceAppreciation = netDividends`, by construction.
- [x] **Buy/sell rows show main-currency equivalent:** When the trading currency differs from the main currency, each buy/sell row displays the main-currency amount in muted text after the trading-currency amount. Snapshot FX rate is used when present; live rate otherwise (suffixed with `~` to indicate approximate).
- [x] Currency view toggle (Trading ↔ Main) in page header. Defaults to trading currency; persists last choice per screen in `localStorage`. Affects all metric amounts, dividend past-payout amounts, and dividend yield TTM. Hidden when trading currency equals main currency. *(Phase 28a)*
- [x] Transactions list shows, for this stock across all the user's investing accounts, sorted by date: buys, sells, and dividends. A filter control lets the user show only selected types: All / Buy / Sell / Dividend. *(Transfer, Split, Exchange filters deferred to SPEC-019/027)* The list is capped at a max-height of 15 rows with standard scroll. *(Phase 28d)*
- [x] Dividend section: past payouts from SPEC-020 records shown in a separate section; payouts with `type === 'special'` display a "Special" badge. *(Next-4 projections deferred to Phase 13c)* Past payouts table merges user `dividends` and `apiDividendHistory` records, deduped by `(ticker, exDate)` with user record taking precedence (user `type` and `perShare` win; API row hidden when both exist for the same date). API-only rows render with muted style and an "API" label. Max-height for 15 rows; scrolling down lazy-loads chronologically older year chunks (one year per chunk). *(Phase 28d)*
- [ ] Top 5 news items via SPEC-027. *(Deferred to SPEC-027)*
- [ ] **Right-column AI panel** is rendered always on desktop, occupying the right half of the page from below the header to the bottom of the viewport. Content of the panel — chat UI or placeholder — is owned by SPEC-026; SPEC-021 owns only the layout slot. *(Deferred to Phase 19b)*
- [ ] On mobile, the AI panel stacks below the rest of the page content (single column), preserving the existing mobile flow. *(Deferred to Phase 19b — mobile parity also covered by SPEC-028)*
- [ ] Stale price indicator / manual price override. *(Deferred to SPEC-027)*
- [x] Positions summary across all investing accounts shown at the top of the page. Average cost shown is fee-inclusive (buy price + pro-rated buy fee per share). *(Phase 26d)*
- [x] Portfolio memberships section shows which portfolios the stock is assigned to (from SPEC-022), with per-portfolio target %.
- [x] Ticker names in the Positions section of InvestingAccountDetail are clickable links that navigate to this stock page.
- [x] **"Refresh dividends" button** in the page header triggers `refreshApiDividendHistory(ticker, exchange)` for the displayed stock, fetching from the provider chain (SPEC-027) and writing results to the `apiDividendHistory` persisted collection. Shows "Refreshing…" while in flight; shows "Refresh failed" on error. An amber dot stale indicator appears next to the button when the ticker has never been successfully refreshed or the last refresh failed. *(Phase 25c)*

## UI / Screens
Desktop layout — two-column split. Left column hosts all stock data; right column hosts the AI panel (owned by SPEC-026):

```
+--------------------------------------------------+--------------------------------+
| AAPL  Apple Inc.                                 |                                |
| Stock exchange: [NASDAQ ▼]   Latest: $182.50      |    AI panel (SPEC-026)         |
|                              Yield TTM: 0.53%     |                                |
| [1D][1W][1M][3M][6M][1Y][5Y][All]                |    — chat thread when AI is    |
| <price chart>                                    |      configured & enabled       |
|                                                  |    — placeholder linking to     |
| Metrics: total return / p.a. / appr / div        |      Settings otherwise         |
|                                                  |                                |
| Transactions  [All ▾]                            |    [Send] textarea at bottom    |
|   2026-04-20  Buy   10 @ $175.20  …              |                                |
|   2026-02-14  Div   $0.24/sh × 15 …              |                                |
|                                                  |                                |
| Dividends — past and projected                   |                                |
|                                                  |                                |
| Portfolios                                       |                                |
|                                                  |                                |
| News (top 5)                                     |                                |
+--------------------------------------------------+--------------------------------+
```

The right column has a fixed minimum width (e.g. ~360px) so the chat is comfortable; the left column expands/contracts with viewport. Mobile stacks these sections vertically (left column first, then the AI panel below); chart, metrics, and news may be collapsed behind tabs per the mobile pared-down view (see SPEC-028 for parity plan).

## Data
No new persistent collections in this spec. Reads:
- `stockTransactions` (SPEC-019) filtered by ticker
- `dividends` (SPEC-020) filtered by ticker
- Per-stock settings (from SPEC-020 — amount-estimation rule, HQ override)
- `investingAccounts` (SPEC-018) to scope the holdings
- `settings.aiConnection` (SPEC-026)

Calls SPEC-027 for: current price, historical series, news, exchange list, HQ country; calls SPEC-017 for currency conversion when toggled to main-currency display.

## Out of Scope
- In-page editing of transactions. Clicking a transaction opens the relevant edit form (owned by SPEC-019 / SPEC-020).
- Watchlist / "stocks I don't own but want to track" pages. Stock page only renders if the user has (or has ever had) a position.
- Custom chart overlays (moving averages, indicators). Raw price line only in Phase 2.
- Comparison chart overlays with benchmarks on the stock page itself — that lives on the Benchmarks page (SPEC-023), which can select per-stock comparison.
- News filtering or sentiment analysis.
- Saving the AI-evaluation response as a persistent artifact. The response is shown transiently and refreshed on the next click (future spec can persist if useful).

## Open Questions
None.
