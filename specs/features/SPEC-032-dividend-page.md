---
id: SPEC-032
name: Dividend page
status: in-progress
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
- [x] New `Dividends` page accessible from the **Investments nav second-row tab** on desktop (alongside `Investments overview / Portfolios / Watchlists / Benchmarks`) and from the Investments dropdown in mobile bottom-nav
- [x] Two tabs: `Calendar` and `Metrics`
- [x] Scope is **held stocks only** — a stock with no open lots across investing accounts does not appear on the page. *(Phase 33 expands the scope: a ticker that has no current open lots is still included if it has any user `dividends` record with `status` in `{'pending-payment','pending-confirmation'}` (the dividend is owed but unpaid). This avoids dropping receivable dividends when the user has already exited a position.)*
- [x] Page-level "Refresh dividend data" button loops `getDividends` for every held ticker; each ticker shows a stale-data indicator (amber dot + tooltip) when its `apiDividendHistory` row is empty or its last refresh failed
- [ ] **Third tab: Pending (Phase 33).** Visible when the SPEC-020 "Confirm receipt before cash impact" toggle is ON OR when any user dividend record has `status: 'pending-payment'` (the latter applies regardless of the toggle since future-dated user-entered dividends always wait for their pay date). The tab title shows a count badge. Tab content is the confirmation queue defined in SPEC-020 § Confirmation flow — table with per-row [Confirm] [Edit] [Delete] actions plus a "Confirm all" bulk button. Auto-promotion of pending-payment → received happens on app boot regardless of whether the user opens this tab.

### Calendar tab — month view
- [x] Month grid with one cell per day in the displayed month
- [x] Each cell shows ex-div and pay-date markers per held stock
- [x] Marker colour coding: pay-date = green; ex-div = blue. Declared = solid; estimated = dashed
- [x] Toggle "Show: Ex-div + Pay | Pay only" with default "Pay only"
- [x] Month nav prev / next / today; persists last viewed month in localStorage
- [x] Marker collision: each cell shows up to 3 colored dots (one per event); when a cell has > 3 events, the third dot is replaced by a "+ N more" link that opens a per-day popup listing every event with full details (ticker, name, amount per share, declared/estimated state)

### Calendar tab — table view
- [x] "Month | Table" view toggle at top of the Calendar tab; remembers last view in localStorage. Default = Table view (matches the source enhancement)
- [x] Table view is vertically scrollable; renders next 3 months of records by default
- [x] As the user scrolls down, further months load in chunks (one month per chunk)
- [x] Columns: date, ticker, name, type (ex-div / pay), amount per share, status (declared / estimated)
- [x] **Ticker column is clickable (Phase 33).** Each ticker is a link to the per-stock Stock page so the user can drill into a specific row without leaving the dividend context first.
- [x] **Edit / Delete actions per row (Phase 33).** Rows backed by a user `dividends` record (including pending-payment / pending-confirmation) carry ✎ Edit and 🗑 Delete buttons. Edit opens the existing `EditDividendDialog` (SPEC-021); Delete shows a confirmation summarising the dividend before removal (and the cash impact if the dividend was `'received'`). Rows backed only by `apiDividendHistory` (declared / estimated) carry → Declare actions where applicable (consistent with the Stock page).

### Metrics tab — payout chart
- [x] X-axis bucket selector: week / month / quarter / year
- [x] Y-axis selector: gross / net (net uses user `dividends.taxPercent`)
- [x] Bar / line toggle
- [x] Filters: company, portfolio, country, region, continent, year range. Default range = last 2 years + current year
- [x] Multi-dataset: user can stack one dataset per portfolio (or per region etc.); chart legend labels each
- [x] Future buckets include both declared (`apiDividendHistory.state='declared'`) and estimated (projected) dividends, with the same solid / dashed visual distinction. Projection input excludes special dividends (per SPEC-020) — only `type === 'regular'` (or untyped legacy) records feed cadence detection and per-share estimation; declared specials still render as themselves but are not extrapolated forward
- [x] Saved chart configurations stored in a new `dividendChartPresets` collection (`name`, X bucket, Y type, filters, datasets, chart type); CRUD inline; Settings → Storage tab card
- [x] **Hover tooltip on every bar (Phase 33).** The tooltip shows the bucket label and a breakdown line: `Paid: …`, `To be paid: …`. For buckets entirely in the past (bucket end < today) only the `Paid:` line is shown. For buckets entirely in the future only the `To be paid:` line is shown. For the bucket spanning today both lines show. Tooltip respects the gross / net toggle.
- [x] **Period-comparison chart (Phase 33).** A new chart-shape toggle alongside Bar / Line: **"Grouped by period"**. When enabled with `X-axis bucket = quarter` the chart shows one cluster per quarter label (Q1 / Q2 / Q3 / Q4); inside each cluster, one bar per year in the filtered year range, colour-coded by year. Same idea for `bucket = month` (12 clusters). **The toggle is only enabled when bucket = quarter or month.** Week bucket (52 clusters × N years = unreadable density) and year bucket (no inner period to group by) both disable the toggle with a tooltip explaining why. The "to be paid" portion still renders with the dashed-fill pattern; tooltip behaviour matches above.

### Metrics tab — tables
- [x] Group selector: by company / by portfolio / by country / by region / by continent
- [x] Column-picker (visible columns): TTM yield, Forward yield, Last 12-months amount, Next 12-months amount (declared + estimated), CAGR 3y, CAGR 5y, CAGR 10y
- [x] CAGR uses **per-share** values from `apiDividendHistory` only (industry-standard "stock dividend growth rate"); shows "NA" when fewer than N+1 years of API history are present
- [x] Yield calculations match the Stock page (Phase 28b) — single source of truth
- [x] Group-level rows aggregate the underlying held stocks weighted by current MV
- [x] Sort: clicking any column header re-sorts the table; sort choice (column + direction) is persisted in localStorage per (grouping, column) so each grouping remembers its own sort. Default when no choice has been made: descending by `Last 12-months amount`
- [x] **Company cell is clickable (Phase 33).** When grouped `by company` the ticker / name cell links to the per-stock Stock page. Disabled for aggregate group-level rows (by portfolio / country / region / continent) since those don't point to a single stock.
- [x] **"Last 12-months amount" = amount the user actually received (Phase 33).** The column sums user `dividends.netTotal` (converted to main) for rows where `payoutDate` falls in `[today − 1y, today]` AND `status === 'received'`. Records in `'pending-payment'` / `'pending-confirmation'` are excluded — they have not yet hit the cash balance. Crucially, the per-record share count is the one already on the user record (which reflects holdings on ex-div date), not the user's current open lots. This replaces the previous calculation (`merged × current shares × FX`), which over-counted phantom dividends from API history the user did not actually receive.
- [x] **"Next 12-months amount" uses holdings on ex-div date, not current holdings (Phase 33).** For each declared row in `apiDividendHistory` with `payDate` in `(today, today + 1y]`:
  - If `exDate ≤ today` (record date already in the past): the user is entitled to the dividend on the shares they held on `exDate − 1`. Use `getOpenLots(ticker, asOfDate = exDate − 1)` regardless of current holdings — even if shares were sold after ex-div, the user receives the payment.
  - If `exDate > today` (record date in the future): use the user's current open lots as the best estimate. Recomputes on every render if holdings change.
  - Multi-account: sum across every account that held the stock on the as-of-date. The held set for the Dividend page is therefore expanded — a ticker stays in scope as long as ANY pending payment exists for it, even if current open lots are zero. The empty-state message ("No held positions") is shown only when both current open lots and pending dividend entitlements are empty.
- [x] **Estimated future amounts also use ex-div-date holdings (Phase 33).** When ex-div date is in the future, the projected amount estimate uses the user's current open lots; the same projection algorithm continues to drop special dividends from cadence input.

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
