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
- [ ] Price chart with a period selector: 1D, 1W, 1M, 3M, 6M, 1Y, 5Y, All. *(Deferred to SPEC-027)*
- [x] Metrics row (market value, total return + %, p.a. return, price-appreciation, dividend return, dividend yield TTM). Exchange rates auto-loaded on mount; values show — when rates unavailable.
- [x] Transactions list shows, for this stock across all the user's investing accounts, sorted by date: buys, sells, and dividends. A filter control lets the user show only selected types: All / Buy / Sell / Dividend. *(Transfer, Split, Exchange filters deferred to SPEC-019/027)*
- [x] Dividend section: past payouts from SPEC-020 records shown in a separate section. *(Next-4 projections deferred to Phase 13c)*
- [ ] Top 5 news items via SPEC-027. *(Deferred to SPEC-027)*
- [ ] **Right-column AI panel** is rendered always on desktop, occupying the right half of the page from below the header to the bottom of the viewport. Content of the panel — chat UI or placeholder — is owned by SPEC-026; SPEC-021 owns only the layout slot. *(Deferred to Phase 19b)*
- [ ] On mobile, the AI panel stacks below the rest of the page content (single column), preserving the existing mobile flow. *(Deferred to Phase 19b — mobile parity also covered by SPEC-028)*
- [ ] Stale price indicator / manual price override. *(Deferred to SPEC-027)*
- [x] Positions summary across all investing accounts shown at the top of the page.
- [x] Portfolio memberships section shows which portfolios the stock is assigned to (from SPEC-022), with per-portfolio target %.
- [x] Ticker names in the Positions section of InvestingAccountDetail are clickable links that navigate to this stock page.

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
