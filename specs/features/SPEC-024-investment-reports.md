---
id: SPEC-024
name: Investment Reports
status: done
created: 2026-04-23
---

# Investment Reports

## Goal
A single Reports section inside Investments that gives the user an overview of all their investments with configurable column sets, named saved filter presets, and four breakdowns (currency, country-level region, continent-level region, Portfolio) in both graphical and tabular form. All totals are expressed in the user's main currency via SPEC-017. Type filter includes stocks (live) and placeholders for the other asset classes (options, bonds, crypto, metals storage, metals lease) so the filter UI is complete from day one even though only stocks render real data in Phase 2.

## User Stories
- As a user, I can open Investment Reports and see a table of all my positions with configurable columns — so I can tailor the view to what I care about right now (e.g. "just yield and p.a. return").
- As a user, I can filter the report by investment type (only stocks today; other types appear as placeholders for later).
- As a user, I can save a useful filter + column configuration under a name and reopen it later in one click. I can edit or delete my saved presets.
- As a user, I can toggle between table and graph views of four breakdowns: by currency, by country-level region, by continent-level region, and by Portfolio.
- As a user looking at regional breakdowns, I know the region reflects the company's HQ country — not the stock exchange it trades on — with my manual overrides applied (from SPEC-019 per-stock).

## Acceptance Criteria
- [x] Investment Reports lives inside the Investments top-level section (SPEC-018). Entry point on the Investments home screen.
- [x] Overview table: one row per position (unique stock × investing-account pair, or aggregated per stock — user-selectable grouping). Columns are configurable from a column-picker.
- [x] Available columns to display (user chooses any subset):
  - ticker, name, price (latest), currency (native), investing account
  - total invested (main currency)
  - current market value (main currency)
  - MV (trading currency) — market value in the stock's own trading currency
  - total return (sum + %), dividend yield (trailing 12 months), dividend yield (FWD)
  - p.a. return (%)
  - price-appreciation return (sum + %)
  - dividend return (sum + %)
  - share on whole portfolio (%)
  - share on selected Portfolio (%) — only meaningful when a SPEC-022 Portfolio is selected as scope
  - share on parent Portfolio node (%) — same
  - comparison with target share (delta pp. vs. SPEC-022 target)
  - average price (weighted, across all buys and sells)
- [x] Type filter with these options: **Stocks** (live), **Options** (placeholder — empty with "not yet supported" note), **Bonds** (placeholder), **Crypto** (placeholder), **Precious metals — storage** (placeholder), **Precious metals — lease** (placeholder). Default: Stocks selected. Multi-select allowed; selecting a placeholder type returns no rows but keeps the filter control live so the UI is complete.
- [x] **Saved filter presets**: user can save the current filter + column selection + grouping + breakdown choice under a user-given name. Preset list shows in a dropdown at the top of the page. Presets can be renamed or deleted.
- [x] Four breakdowns — available as **Graph** and **Table** tabs for each:
  - **Currency**: sum & share of investments grouped by native currency (e.g. "USD 58%, EUR 25%, CZK 17%"). Totals computed in main currency.
  - **Regional — country-detail**: buckets = US, Canada, Latin America, Europe, Africa, Russia, China, India, Australia + NZ, Global.
  - **Regional — continent-level**: buckets = North America, South America, Europe, Africa, Asia, Australia + NZ, Global.
  - **Portfolio**: one row per leaf portfolio node (or selected level), with sum & share.
- [x] All totals in the report are expressed in main currency via SPEC-017, using current rates for "now" totals and snapshotted rates for historical attribution (returns since-buy use transaction-date rates from SPEC-019).
- [x] **Cash inclusion**: the top-of-page "total value" rollup includes both position market value **and** cash balances (SPEC-018) so the user can reconcile against the broker statement. Position-only tables and the position-focused breakdowns (currency / regional / portfolio) exclude cash and report only stock positions.
- [x] Region attribution per position comes from the stock's HQ country (SPEC-027 lookup + the per-stock manual override on the shared stock-profile record introduced by SPEC-020), mapped through a fixed country→region table. A stock whose HQ country doesn't map to a known region falls into "Global."

### Table tab (Phase 29d)
- [x] Table tab uses the shared `ConfigurableTable` component (Phase 27b) — built-in sort by any visible column, column-picker, fullscreen expand.
- [x] Filter bar above the table with five `HybridFilterDropdown` filters: Portfolio, Currency, Country, Region, Continent. Active filters narrow `tableRows` via a `useMemo`; position count shown alongside the filters.
- [x] Portfolio filter uses single-select semantics (a stock in multiple portfolios must not be double-counted).

### Portfolio tab (Phase 29c)
- [x] When no specific portfolio is scoped ("all portfolios" mode): the pie chart is hidden (a stock in multiple portfolios would be counted multiple times, distorting the pie).
- [x] In all-portfolios mode, show a summary table instead: portfolio name, total value, total return ($/%), TTM dividend yield (%), yearly dividend amount, average monthly dividend amount.

### Pie charts tab (Phase 29a + 29b)
- [x] New "Pie charts" tab in the breakdown bar, after "By Portfolio".
- [x] Each tile is an independently configured saved pie chart: name, grouping dimension (currency / country / region / continent / portfolio / stock), optional portfolio filter (single-select only — multi-select would double-count), optional currency filter, "Other" threshold % (items below threshold collapse into a single "Other" slice), show-table-below toggle.
- [x] Layout: desktop user picks 1 / 2 / 3 / 4 tiles per row; mobile = 1 per row always.
- [x] Each tile has a fullscreen button (full-viewport overlay showing chart + optional data table).
- [x] "Other" slice in the pie aggregates items below the threshold; the data table below (when enabled) always shows full granularity.
- [x] Tiles can be drag-reordered; order persisted via `gridPosition` field.
- [x] "Add chart" button creates a new tile immediately in edit mode. Inline form: name, group-by, Other threshold, portfolio filter, show-table toggle. Save / Cancel / Delete actions.
- [x] Settings → Storage tab card: pie-chart preset count + bytes + "Delete all" button with inline confirm.
- [x] `pieChartPresets` collection included in Data Portability export (both Sharable and Full backups) and importable.

## UI / Screens
Top of Reports (desktop layout from SPEC-015):

```
+--------------------------------------------------------+
| Investment Reports                                     |
|   Preset: [— none ▼]  [Save preset] [Manage presets]   |
|   Types: [✓ Stocks] [ Options] [ Bonds] [ Crypto] ...  |
|   Group by: (o) Stock   ( ) Stock × account             |
|   Main currency: CZK   [Refresh rates]                  |
+--------------------------------------------------------+
| [Table] | [By currency] | [By region] | [By portfolio]  |
+--------------------------------------------------------+
```

Table tab (desktop — columns configurable):

```
Ticker  Name         Market value   Total return    p.a.   Div yield   ...
AAPL    Apple Inc.   165 200 CZK    +18.4% (+25k)  11.2%   0.53%       ...
MSFT    Microsoft    132 400 CZK     +9.1% (+11k)   6.7%   0.87%       ...
...
```

By region (chart + table side-by-side on desktop):

```
[ Chart: pie / bar of region shares ]  | Region         Value         %
                                       | US            260k CZK     52%
                                       | Europe         90k CZK     18%
                                       | Global         45k CZK      9%
                                       | ...
```

Manage presets (dialog or dedicated screen):

```
Saved presets
  · Yield focus     [Rename] [Delete] [Load]
  · Tax report       [Rename] [Delete] [Load]
  · [+ Save current selection as preset]
```

## Data

`investmentReportPresets` collection (localStorage key `rmoney_investment_report_presets`):

```
{
  id: string,
  name: string,
  config: {
    typeFilter: ['stocks' | 'options' | 'bonds' | 'crypto' | 'metals-storage' | 'metals-lease'],
    grouping: 'stock' | 'stock-x-account',
    columns: string[],                 // column ids
    breakdown: 'table' | 'currency' | 'region-country' | 'region-continent' | 'portfolio' | 'pie-charts',
    portfolioScopeId: string | null    // when breakdown scoped to a SPEC-022 portfolio
  },
  createdAt: ISO timestamp
}
```

`pieChartPresets` collection (localStorage key `rmoney_pie_chart_presets`):

```
{
  id: string,
  name: string,
  gridPosition: number,              // display order (0-based)
  grouping: 'currency' | 'country' | 'region' | 'continent' | 'portfolio' | 'stock',
  filters: {
    portfolioId: string | null,      // single-select only
    currencies: string[]             // multi-select
  },
  displayCurrency: string | null,
  otherThresholdPct: number,         // default 1 — items below this % collapse to "Other"
  showTableBelow: boolean,           // show full-granularity table beneath the pie
  chartType: 'pie'                   // extensible for bar etc. in future
}
```

Reads:
- `stockTransactions` (SPEC-019), `dividends` (SPEC-020) — for cost basis, realized, dividend returns
- `investingAccounts` (SPEC-018) — for grouping
- `portfolios` + `portfolioAssignments` (SPEC-022) — for portfolio breakdowns + target comparisons
- SPEC-027 — current prices, HQ country (region source)
- SPEC-017 — currency conversion to main

No writes to existing collections beyond its own preset lists.

## Out of Scope
- Options / bonds / crypto / metals rendering actual data. Those appear as empty filter slots; their real implementation is a future spec each (Phase 20 placeholder).
- Historical snapshots of the report ("show me the same report as of last quarter"). Phase 2 reports are always current.
- Tax-year reports with realized gains/losses aggregation tailored to a tax regime. A generic realized-P/L column is part of the available columns, but there's no tax-specific logic.
- Exporting the report as CSV or PDF. SPEC-016 Data Portability covers full-state export; a focused report export is future work.
- Alerts / notifications on threshold breaches ("your US exposure exceeded 70%").

## Open Questions
None.
