---
id: SPEC-032
name: Dividend page
status: ready
created: 2026-05-06
---

# Dividend page

## Goal
Give the user a dedicated screen to see when their dividends are coming in, how much has been paid, and how their dividend income is trending — without having to walk one stock at a time on the Stock page. The page is a portfolio-wide income dashboard with two tabs: a calendar of upcoming and recent payouts, and a metrics view with charts and cross-stock comparison tables.

## User Stories
- As a dividend-focused investor, I can open one screen and see every payout coming up in the next month so I know when income lands.
- As a portfolio owner, I can see my total dividend income split by company / portfolio / country / region / continent so I know where my income is concentrated.
- As an investor researching dividend growth, I can see CAGR over 3 / 5 / 10 years per stock so I can identify reliable growers.
- As a long-term planner, I can save customised dividend payout charts (X-axis bucket, filters, datasets) so I can track the views I care about without rebuilding them every time.

## Acceptance Criteria

### Page shell
- [ ] New `Dividends` page accessible from the **Investments nav second-row tab** on desktop (alongside `Investments overview / Portfolios / Watchlists / Benchmarks`) and from the Investments dropdown in mobile bottom-nav
- [ ] Two tabs: `Calendar` and `Metrics`
- [ ] Scope is **held stocks only** — a stock with no open lots across investing accounts does not appear on the page
- [ ] Page-level "Refresh dividend data" button loops `getDividends` for every held ticker; each ticker shows a stale-data indicator (amber dot + tooltip) when its `apiDividendHistory` row is empty or its last refresh failed

### Calendar tab — month view
- [ ] Month grid with one cell per day in the displayed month
- [ ] Each cell shows ex-div and pay-date markers per held stock
- [ ] Marker colour coding: pay-date = green; ex-div = blue. Declared = solid; estimated = dashed
- [ ] Toggle "Show: Ex-div + Pay | Pay only" with default "Pay only"
- [ ] Month nav prev / next / today; persists last viewed month in localStorage
- [ ] Marker collision: each cell shows up to 3 colored dots (one per event); when a cell has > 3 events, the third dot is replaced by a "+ N more" link that opens a per-day popup listing every event with full details (ticker, name, amount per share, declared/estimated state)

### Calendar tab — table view
- [ ] "Month | Table" view toggle at top of the Calendar tab; remembers last view in localStorage. Default = Table view (matches the source enhancement)
- [ ] Table view is vertically scrollable; renders next 3 months of records by default
- [ ] As the user scrolls down, further months load in chunks (one month per chunk)
- [ ] Columns: date, ticker, name, type (ex-div / pay), amount per share, status (declared / estimated)

### Metrics tab — payout chart
- [ ] X-axis bucket selector: week / month / quarter / year
- [ ] Y-axis selector: gross / net (net uses user `dividends.taxPercent`)
- [ ] Bar / line toggle
- [ ] Filters: company, portfolio, country, region, continent, year range. Default range = last 2 years + current year
- [ ] Multi-dataset: user can stack one dataset per portfolio (or per region etc.); chart legend labels each
- [ ] Future buckets include both declared (`apiDividendHistory.state='declared'`) and estimated (projected) dividends, with the same solid / dashed visual distinction
- [ ] Saved chart configurations stored in a new `dividendChartPresets` collection (`name`, X bucket, Y type, filters, datasets, chart type); CRUD inline; Settings → Storage tab card

### Metrics tab — tables
- [ ] Group selector: by company / by portfolio / by country / by region / by continent
- [ ] Column-picker (visible columns): TTM yield, Forward yield, Last 12-months amount, Next 12-months amount (declared + estimated), CAGR 3y, CAGR 5y, CAGR 10y
- [ ] CAGR uses **per-share** values from `apiDividendHistory` only (industry-standard "stock dividend growth rate"); shows "NA" when fewer than N+1 years of API history are present
- [ ] Yield calculations match the Stock page (Phase 28b) — single source of truth
- [ ] Group-level rows aggregate the underlying held stocks weighted by current MV
- [ ] Sort: clicking any column header re-sorts the table; sort choice (column + direction) is persisted in localStorage per (grouping, column) so each grouping remembers its own sort. Default when no choice has been made: descending by `Last 12-months amount`

## UI / Screens
- **Page header:** title, scope description ("held stocks only"), `Refresh dividend data` button, last-refresh timestamp.
- **Calendar tab:** view toggle (Month / Table), month nav (Month view only), filter toggle (Ex-div + Pay / Pay only). Color-coded markers per day or per row.
- **Metrics tab:** at top, the chart configuration UI with saved-preset list. Below the chart, the metrics tables section with grouping selector and column-picker.

## Data
- **Reads:** `stockTransactions` (to compute held set = positive open positions), `dividends` (user records — for "Last 12 months net" and tax-aware net amounts), `apiDividendHistory` (per-share gross — for TTM / forward yield / CAGR / calendar / projections), `stockProfiles` (HQ country / region / continent / dividend frequency), `portfolios` + `portfolioAssignments` (multi-dataset chart per portfolio; grouping in metrics tables).
- **Writes:** new `dividendChartPresets` collection (saved payout-chart configurations).
- **Persistent UI state in localStorage:** `rmoney_dividend_calendar_view` (month or table), `rmoney_dividend_calendar_month` (last viewed month), `rmoney_dividend_calendar_filter` (ex-div+pay or pay-only), `rmoney_dividend_metrics_grouping` (selected grouping), `rmoney_dividend_metrics_columns` (visible columns + order).
- **Source precedence (used by all yield, calendar, and metric calculations):** `dividends` (user records) and `apiDividendHistory` are merged at read time, deduped by `(ticker, exDate)`. The user record always wins on conflict — including its `type: 'regular' | 'special'` and `perShare` fields. This rule feeds: TTM yield (Stock page + metrics tab), forward yield (uses `lastRegularPerShare` from the merged view), past payouts table on the Stock page, the Calendar tab markers, and the metrics tab tables. Manually-entered future declarations (`source: 'manual'` rows in `apiDividendHistory`) are hidden once a user `dividends` record exists for the same `(ticker, exDate)`.

## Out of Scope
- Watchlist stocks (only held stocks appear; pre-purchase dividend research is on the Stock page).
- Tax-lot reconciliation against broker tax statements (not modelled).
- Currency-by-currency aggregation in the metrics tab (the metrics tab uses main currency only; trading currency only appears on the Stock page).
- Personal-CAGR view of dividend income (the chart already displays personal trajectory; CAGR is the standard per-share metric).

## Open Questions
- None. Resolved during 2026-05-06 design review:
  - Marker collision (Month view) → **stacked dots, max 3, "+ N more" link to per-day popup** (acceptance criterion in Calendar — month view).
  - Default table sort → **user-selectable per column, persisted per (grouping, column); default descending by Last 12-months amount** (acceptance criterion in Metrics — tables).
  - Page placement → **Investments nav second-row tab** on desktop, Investments dropdown on mobile (acceptance criterion in Page shell).
