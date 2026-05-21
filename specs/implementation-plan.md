# Implementation Plan

> Remaining feature work, ordered by recommended implementation sequence.
> When an item is fully implemented, **remove it** from this file.
> Items are grouped by spec but ordered by cross-spec dependencies and shared-code opportunities.

**Current phase: Phase 32 in progress** *(All MVP feature phases complete: 3, 4b, 5b, 5c, 6, 6b, 7; Phases 8–18 and 22–31 mostly complete — 3 deferred items in Phase 26 remain; Phase 31 done — Dividend page (SPEC-032) complete; Phase 32 in progress — sub-phases 32a + 32j done, sub-phases 32b–32i outstanding)*

**Post-MVP — Project Phase 2 enhancements:** Phases 8–21 below cover the Phase 2 work from `project goal.md` (desktop layout, data portability, app-wide currency conversion, and the full Investments module). Start these after Phase 7.

**Project Phase 3 — Investments enhancements:** Phases 25–31 below capture the requirements written in `scratch_notes/Investments_enhancements.md` (May 2026). They extend SPEC-018, SPEC-019, SPEC-020, SPEC-021, SPEC-024, SPEC-027, SPEC-029 and introduce two new specs (SPEC-032 Dividend page, SPEC-033 Stock inventory). Build order respects: historical-FX snapshotting (item 146) is a hard prerequisite for XIRR + cross-currency fee folding; the API dividend history collection in Phase 25 is a hard prerequisite for the new TTM/forward yields, the Dividend page metrics, and the calendar.

**Project Phase 4 — Buy-Sell Planning + UX gap closure:** Phase 32 captures the requirements written in `scratch_notes/notes 10May2025.md` (May 2026). It introduces SPEC-034 (Buy-Sell Planning, a new sandbox screen) and extends SPEC-019, SPEC-020, SPEC-021, SPEC-018, SPEC-029 to fix gaps surfaced by user testing (auto-fill share count from lot history, single-line dividend rows, lot-quantity bounds + two-way binding, fullscreen z-index for action modals, manual stocks with user-entered prices). Sub-phase 32j (added 2026-05-16) extends SPEC-029, SPEC-033, and SPEC-025 with: a rename-vs-remap mode choice (so a wrong CSV auto-mapping can be cleared without keeping orphan history), a confirmation review view in Stock inventory, and a post-CSV-commit nudge into that view. Phase 32 sits after Phase 31 in the build queue per the user's preference.

---

## Shared code to build early

These patterns recur across multiple features. Building them as reusable utilities early avoids duplication later.

| Shared concern | Used by | Notes |
|---|---|---|
| **Hierarchical tree component** | Categories (SPEC-003, done), Envelopes (SPEC-004), Planned expenses (SPEC-009) | Expand/collapse, indentation, parent-sum display. Already built for categories/envelopes — ensure it's generic enough for planned expenses. |
| **Cascade-delete confirmation dialog** | Categories (done), Envelopes (done), Planned expenses (SPEC-009) | Lists all descendants that will be deleted. Same pattern everywhere — extract if not already shared. |
| **Planning period calculation** | Dashboard (SPEC-008), Category Budgets (SPEC-011) | Given a start day, compute current period boundaries. Single utility, used in multiple places. |
| **Recurring/scheduled execution engine** | Transaction Entry recurring transactions (SPEC-005), Scheduled envelope transfers (SPEC-004), Planning-generated transfers (SPEC-009), Bills & Income auto-apply/outstanding (SPEC-013) | Determines when the next occurrence fires and creates the record. One engine, four consumers. |
| **Frequency math (yearly ↔ quarterly ↔ monthly)** | Planning (SPEC-009), Category Budgets (SPEC-011) | `monthly × 12 = yearly`, `monthly × 3 = quarterly`. Tiny utility but used in two specs. |
| **One-time / regular toggle on transfer form** | Envelopes (SPEC-004), Planning (SPEC-009), Scheduled Transfers (SPEC-012) | Single form component with configurable default. |
| **Drag-and-drop tree interaction** | Planning expenses (SPEC-009), Planning incomes (SPEC-009), Categories (SPEC-003), Envelopes (SPEC-004), Portfolios (SPEC-022) | Shared component: drag handle, drop indicator, reparent/reorder logic. One component, five consumers. |
| **Currency conversion / exchange-rate cache** | Dashboard (SPEC-008), Budgets (SPEC-011), Planning (SPEC-009), Transaction list (SPEC-006), Envelope list (SPEC-007), Stock transactions (SPEC-019), Dividends (SPEC-020), Stock page (SPEC-021), Investment reports (SPEC-024), CSV import (SPEC-025) | Single conversion layer with 1-hour TTL cache and manual refresh. Closes the deferred "currency conversion" item from SPEC-002. |
| **Market data API client (fallback chain)** | Stock transactions (SPEC-019), Dividends (SPEC-020), Stock page (SPEC-021), Benchmarks (SPEC-023), Investment reports (SPEC-024), Currency conversion (SPEC-017), Splits detection (SPEC-019) | IBKR Web API → Yahoo Finance → Massive → Twelve Data → Finnhub → Alpha Vantage → Stooq, failure-only fallback. Unified request interface for prices, dividends, corporate actions, news, forex, index series. Manual override always wins. Yahoo + Stooq are key-less but CORS-blocked, so they share a transport-abstraction layer (Tauri HTTP plugin in production, Vite dev-proxy in dev). |
| **Inline form expansion (desktop new-record)** | Transactions, Envelope transfers, Scheduled transfers, Planning items, Budgets, Investing accounts, Stock transactions, Dividends | Desktop-only: empty row appears at top of list and expands into a form. Mobile keeps dedicated-route pattern. |
| **AI connection client** | Stock page (SPEC-021) — now; per-stock prompt overrides later | Single per-user connection at More → Settings. |
| **Cash balance / cash movement ledger** | Investing accounts (SPEC-018), Stock transactions (SPEC-019), Dividends (SPEC-020), Stock page (SPEC-021), Investment reports (SPEC-024), CSV import (SPEC-025) | Unified `cashMovements` collection behind every in/out touching a cash balance. Single source for current balance, transaction history per balance, negative-balance policy. |
| **Persisted history vs hot cache** | API dividend history (SPEC-020 + SPEC-027), historical price series for charts (SPEC-021 + SPEC-027), historical FX snapshots stored on transactions (SPEC-019 item 146) | Two distinct data categories that have been conflated under "cache." **Hot cache** = short TTL, freely rebuildable on next load (latest price, current forex spot, news, latest profile). Cleared without consequence; **excluded** from backups. **Persisted history** = no TTL, expensive to refetch (rate-limited APIs), included in **Full backup** and surfaced in the Settings → Storage tab as its own card with per-stock breakdown. **Snapshot rates per transaction** are primary data on the transaction record itself (immutable), not in any cache. Refresh of persisted history is user-triggered, not automatic. |
| **Hybrid filter dropdown (search + multi-select)** | Cash movements stock/portfolio/currency filter (SPEC-018), Dividend page metrics-table filter (SPEC-032), Reports pie-chart filters (SPEC-024), CSV import dedup filter | Compact dropdown that opens into a panel with an inline search box and a checkbox list. Reused wherever a filter has dozens-to-hundreds of options. |
| **Currency view toggle (trading ↔ main)** | Stock page (SPEC-021), Dividend page (SPEC-032 — optional follow-up) | Per-screen toggle persisting last choice in localStorage. Default on Stock page = trading currency (single-stock context); default elsewhere = main currency. Affects metric formatting only — calculations remain consistent (XIRR + fee-inclusive avg always in main; forward/TTM yield computed in the displayed currency). |
| **Configurable column table (positions)** | Investing account detail per-account positions (SPEC-018 / SPEC-024 extension), potential reuse for Reports table tab columns | Generic table component: column-picker, drag-reorder, sort by visible column, scrollable to N rows max-height, fullscreen expand. |
| **Soft-delete / archive lifecycle** | Stock inventory (SPEC-033), potential future reuse for accounts/portfolios | Archive flag hides item from selection lists but preserves history. Archive view exposes click-through links to underlying records. Permanent-delete only when no history remains. |

### Shared code status

Track whether each shared utility has been extracted as a reusable module. Update this section as code is built.

| Utility | Status | Location | Notes |
|---|---|---|---|
| Hierarchical tree component | **inline** | Used in Categories + Envelopes screens | Needs review — is it generic enough for planned expenses, or tightly coupled to current data shapes? |
| Cascade-delete confirmation dialog | **inline** | Used in Categories + Envelopes | Extract into shared component before SPEC-009 needs it |
| Planning period calculation | **shared** | `utils/planningPeriod.js` + `data/settings.js` | Used by Dashboard, available for budgets |
| Recurring/scheduled execution engine | **not started** | — | Build when starting Bills & Income (Phase 5b, SPEC-013) |
| Frequency math | **shared** | `utils/frequency.js` | Used by Planning (SPEC-009); available for Category Budgets |
| One-time / regular toggle | **shared** | `components/EnvelopeTransferForm.jsx` | Merged into single form with `defaultMode` prop |
| Drag-and-drop tree interaction | **shared** | `utils/treeDnd.js` + `@dnd-kit/core` in Categories, Envelopes, Planning | |
| Currency conversion / exchange-rate cache | **not started** | — | Build in Phase 10 — foundation for all Investments phases. |
| Market data API client | **not started** | — | Build in Phase 11 — shared by all stock/dividend/benchmark/FX calls. |
| Inline form expansion (desktop) | **shared** | `components/InlineFormRow.jsx` | Consumed by Transactions, ScheduledTransfers, Planning, Budgets. Investing phases add their own screens. |
| AI connection client | **shared** | `data/settings.js` (`getAiConnection`/`setAiConnection`) | Single per-user connection at More → Settings. |
| Cash balance / cash movement ledger | **shared** | `data/investingAccounts.js` | Unified `cashMovements` collection; current balance = sum of movements; CRUD for balances + all movement types. |
| Persisted history vs hot cache | **shared** | `data/apiDividendHistory.js` (persisted), `utils/marketDataCache.js` (hot) | Categorization documented, export rules enforced, Storage cards added. Phase 25b complete. `apiDividendHistory.js` now also owns upsert, stale-check, and `refreshApiDividendHistory()`. Phase 25c complete. |
| Hybrid filter dropdown | **shared** | `components/HybridFilterDropdown.jsx` | Built in Phase 27a. Used by cash movements in InvestingAccountDetail; reuse on Dividend page (Phase 31) and Reports filters (Phase 29). |
| Currency view toggle | **shared** | `components/CurrencyToggle.jsx` | Pill toggle Trading/Main; persists per-screen in localStorage. Used by Stock page (Phase 28a). |
| Configurable column table | **shared** | `components/ConfigurableTable.jsx` | Built in Phase 27b. Used by per-account positions; evaluate reuse on Reports Table tab in Phase 29. |
| Soft-delete / archive lifecycle | **shared** | `data/stockProfiles.js` (`getActiveStockProfiles`, `getArchivedStockProfiles`) | Data fields + read helpers added in Phase 25f. Archive/unarchive write path built in Phase 30b. |
| XIRR algorithm | **shared** | `utils/xirr.js` | Newton-Raphson XIRR over irregular cash flows. Used by Stock page p.a. return (Phase 28b); available for Dividend page CAGR (Phase 31e) and Reports (Phase 29). |

> **Statuses:** `not started` → `inline` (works but lives in one feature) → `shared` (extracted as reusable module with path noted in Location)

---

## Cross-spec data dependencies

Shows which specs create data and which specs read it. Explains why phases are ordered the way they are, and highlights impact when a data shape changes.

```
SPEC-002 Accounts
  └─ read by: SPEC-005 Transaction Entry
              SPEC-006 Transaction List
              SPEC-007 Envelope List
              SPEC-008 Dashboard
              SPEC-013 Bills & Income (account picker)

SPEC-003 Categories
  └─ read by: SPEC-005 Transaction Entry
              SPEC-006 Transaction List
              SPEC-007 Envelope List
              SPEC-011 Category Budgets
              SPEC-013 Bills & Income (optional category)

SPEC-004 Envelopes (envelopes + transfers + scheduled transfers)
  └─ read by: SPEC-005 Transaction Entry
              SPEC-006 Transaction List
              SPEC-007 Envelope List
              SPEC-008 Dashboard (widgets)
              SPEC-009 Planning (envelope pickers, generates scheduled transfers)
              SPEC-012 Scheduled Transfers (reads all scheduled transfers)
              SPEC-013 Bills & Income (optional envelope)

SPEC-005 Transaction Entry (transactions + recurring rules + payees)
  └─ read by: SPEC-006 Transaction List
              SPEC-007 Envelope List
              SPEC-008 Dashboard (period summary, upcoming)
              SPEC-011 Category Budgets (actuals vs target)
  └─ written by: SPEC-013 Bills & Income (creates transactions when confirmed/auto-applied)

SPEC-008 Dashboard (planning period setting)
  └─ read by: SPEC-011 Category Budgets (period alignment)

SPEC-009 Planning (planned incomes + planned expense tree — envelope-only, no account link)
  └─ writes to: SPEC-004 scheduled envelope transfers (generated from planned **expenses** only;
                planned incomes are scratchpad-only and do not generate transfers)
  └─ read by:   SPEC-012 Scheduled Transfers (source indicator)

SPEC-013 Bills & Income (planned account transactions)
  └─ writes to: SPEC-005 transactions (auto-apply or user-confirmed)
  └─ reads:     SPEC-002 Accounts, SPEC-003 Categories, SPEC-004 Envelopes
```

SPEC-014 Drag and Drop Reordering (UI interaction — no new data)
  └─ modifies: SPEC-003 Categories (parentId, order)
              SPEC-004 Envelopes (parentId, order)
              SPEC-009 Planning (parentId, order)
              SPEC-022 Portfolios (parentId, order)

--- Project Phase 2 (post-MVP) ---

SPEC-015 UI enhancements (desktop layout + inline forms — UI only, no new data)
  └─ modifies: all list-based screens

SPEC-016 Data portability (full app-state export/import — reads/writes all data)
  └─ reads:  everything
  └─ writes: everything (load replaces current state)

SPEC-017 Currency conversion (main currency + rate cache)
  └─ read by: SPEC-008 Dashboard, SPEC-006 Transaction list, SPEC-007 Envelope list,
              SPEC-009 Planning, SPEC-011 Budgets,
              SPEC-019 Stock transactions, SPEC-020 Dividends, SPEC-021 Stock page,
              SPEC-024 Investment reports, SPEC-025 Investment CSV import
  └─ reads:   SPEC-027 Market data (fetches forex via API chain)

SPEC-018 Investing accounts (+ cash balances + cash movements + deposits/withdrawals/standalone exchanges)
  └─ reads:    SPEC-002 Accounts (deposit source / withdrawal destination),
               SPEC-004 Envelopes (deposit / withdrawal envelope),
               SPEC-017 Currency conversion (main-currency rollups + cross-currency deposit/withdrawal),
               SPEC-027 Market data (exchange-rate defaults for cross-currency deposits and standalone exchanges)
  └─ writes:   SPEC-005 Transactions (linked read-only expense on deposit, linked income on withdrawal)
  └─ read by:  SPEC-019 Stock transactions (source/destination cash balance for buy/sell; fee debit for transfer),
              SPEC-020 Dividends (dividend cash landing), SPEC-021 Stock page, SPEC-024 Investment reports,
              SPEC-025 Investment CSV import

SPEC-019 Stock transactions (buys, sells, transfers, splits, currency-exchange — lots + cost basis)
  └─ reads:    SPEC-018 Investing accounts + cash balances (source/destination of cash movements),
               SPEC-017 Currency conversion (snapshot rates),
               SPEC-027 Market data (prices, corporate actions, FX default rates)
  └─ writes:   SPEC-018 cashMovements (buy / sell / buy-fee / sell-fee / transfer-fee / currency-exchange),
               SPEC-021 Stock page (displayed), SPEC-024 Reports
  └─ no longer writes directly to SPEC-005 Transactions — the budgeting side is only touched via SPEC-018 deposits/withdrawals

SPEC-020 Dividends (records + tax hierarchy + future projections)
  └─ reads:    SPEC-018 Investing accounts + cash balances (landing balance),
               SPEC-017 Currency conversion, SPEC-027 Market data (dividend declarations)
  └─ writes:   SPEC-018 cashMovements (type: dividend) on the matching-currency cash balance
  └─ no longer writes directly to SPEC-005 Transactions — dividends move to budgeting via a later SPEC-018 withdrawal

SPEC-021 Stock page (chart, metrics, transactions view, dividend view, news, AI)
  └─ reads: SPEC-019, SPEC-020, SPEC-022, SPEC-026, SPEC-027

SPEC-022 Portfolios (nested investment-grouping hierarchies with target %)
  └─ read by: SPEC-023 Benchmarks, SPEC-024 Investment reports

SPEC-023 Benchmarks (curated + user-added; whole / per-Portfolio / per-stock)
  └─ reads: SPEC-019 positions, SPEC-022 Portfolios, SPEC-027 Market data (index series)

SPEC-024 Investment reports (overview + currency/regional/portfolio breakdowns)
  └─ reads: SPEC-019, SPEC-020, SPEC-022, SPEC-017, SPEC-027

SPEC-025 Investment CSV import (named templates + inline first-time mapping)
  └─ writes: SPEC-019 Stock transactions, SPEC-020 Dividends (as appropriate)
  └─ reads:  SPEC-018 Investing accounts

SPEC-026 AI evaluation integration (single per-user connection)
  └─ read by: SPEC-021 Stock page

SPEC-027 Market data integration (IBKR → Massive → Twelve Data → Alpha Vantage)
  └─ read by: SPEC-017 Currency conversion, SPEC-019, SPEC-020, SPEC-021,
              SPEC-023 Benchmarks, SPEC-024 Reports, SPEC-029, SPEC-030

SPEC-029 Stock profile resolution (waterfall: providers → AI → manual; bidirectional)
  └─ reads:   SPEC-026 AI connection, SPEC-027 `getStockProfile` (provider chain)
  └─ writes:  extends `stockProfiles` with name/exchange/currency/resolvedSource/resolvedAt
  └─ read by: SPEC-019 Stock transactions (buy form ticker resolution),
              SPEC-021 Stock page (header display + Refresh profile),
              SPEC-030 Watchlists (add-stock resolution)

SPEC-030 Watchlists & alerts (curated lists, price-threshold alerts, on-open evaluation)
  └─ reads:   SPEC-027 latest prices, SPEC-029 resolution flow, `stockProfiles` (display)
  └─ writes:  new `watchlists`, `watchlistEntries`, `watchlistAlerts` collections
  └─ modifies SPEC-018: Investments nav entry becomes a dropdown (Investments overview / Portfolios / Watchlists)

--- Project Phase 3 (Investments enhancements) ---

SPEC-032 Dividend page (calendar + metrics tabs, scoped to held stocks)
  └─ reads:    SPEC-019 stock transactions (current open positions = held set),
               SPEC-020 user dividend records (for "dividend return" amounts in metrics tab),
               SPEC-027 `apiDividendHistory` (TTM, forward yield, CAGR, calendar, projections),
               SPEC-022 Portfolios (multi-dataset chart per portfolio; grouping in metrics tables),
               SPEC-029 stockProfiles (HQ country / region / continent for grouping; dividend frequency)
  └─ writes:   `dividendChartPresets` collection (saved payout-chart configurations)

SPEC-033 Stock inventory (page listing all included stocks; add-without-buy; edit; archive)
  └─ reads:    SPEC-029 stockProfiles, SPEC-019 stock transactions (history-presence flag),
               SPEC-020 dividends (history-presence flag), SPEC-022 portfolioAssignments,
               SPEC-030 watchlistEntries
  └─ writes:   `stockProfiles` (extends with `archived: bool`, `archivedAt`); no new collection

SPEC-027 Market data (extension — Project Phase 3)
  └─ adds:     `apiDividendHistory` persistent collection (per-stock dividend records, declared/estimated state),
               `getIntradaySeries(ticker, exchange)` provider method,
               dividend type + frequency fields on adapter responses where the provider supplies them

SPEC-019 Stock transactions (extension — Project Phase 3)
  └─ adds:     edit transactions (buy/sell/transfer/split/currency-exchange);
               weighted-average price now folds in pro-rated buy fees;
               fee-currency invariant = trading currency (validated on entry)

SPEC-020 Dividends (extension — Project Phase 3)
  └─ adds:     `type: 'regular' | 'special'` per payout (user-editable, API-filled if available);
               manual "Refresh dividend data" button writes to `apiDividendHistory`

SPEC-021 Stock page (extension — Project Phase 3)
  └─ adds:     trading/main currency toggle, multi-account total row, TTM yield (from cache),
               forward yield, dividend return (all + L12M), XIRR p.a., 1D chart,
               scrollable past-payouts + transactions tables, % share column in portfolio memberships,
               future dividend declarations + manual editing, enter buy/sell/dividend from page

SPEC-024 Investment reports (extension — Project Phase 3)
  └─ adds:     pie-chart tab (tile model, saved presets, "Other" group, fullscreen),
               configurable per-account positions table (12 columns, scrollable, fullscreen, sortable, today's-close change),
               cash-movements filters + virtualization + readability,
               portfolio-tab cleanup (remove pie + share column when all portfolios shown),
               table-tab filters + ordering + MV-trading-currency column

SPEC-029 Stock profile resolution (extension — Project Phase 3)
  └─ adds:     "Add stock without Buy" entry point, "Edit profile" form,
               "Re-look up" button on Buy form when ticker matches existing profile

SPEC-018 Investing accounts (extension — Project Phase 3)
  └─ adds:     hybrid filter dropdown for cash movements; remove the bottom-of-overview Portfolios footer button

--- Project Phase 4 (Buy-Sell Planning + UX gap closure) ---

SPEC-034 Buy-Sell Planning (NEW — sandbox screen for planning trades before executing)
  └─ reads:   SPEC-018 cash balances + investing accounts, SPEC-019 stockTransactions (open lots),
              SPEC-020 user dividends, SPEC-027 latest prices + forex, SPEC-029 stockProfiles,
              SPEC-027 apiDividendHistory (yield calcs), Settings → Investments → Trading fees
  └─ writes:  new `tradingScenarios` collection; on row Execute → existing SPEC-019 buy/sell paths;
              extends `rmoney_settings` with `tradingFees: { exchanges, stocks }`

SPEC-019 Stock transactions (extension — Project Phase 4)
  └─ adds:    per-lot upper-bound clamp on Sell form lot picker;
              two-way binding between total shares and per-lot quantities

SPEC-020 Dividends (extension — Project Phase 4)
  └─ adds:    auto-fill `shareCount` from `getOpenLots(ticker, accountId, exDate − 1)`;
              cash-landing regression test (createDividend must write a `cashMovement`)

SPEC-021 Stock page (extension — Project Phase 4)
  └─ adds:    single-line dividend list rows (no sublines; short headers + tooltips;
              Special as a column value, not an inline chip)

SPEC-018 Investing accounts (extension — Project Phase 4)
  └─ adds:    action-modal z-index above ConfigurableTable fullscreen overlay
              (so Sell/Dividend modals are visible when Positions table is fullscreen)

SPEC-029 Stock profile resolution (extension — Project Phase 4)
  └─ adds:    `isManual: bool` + `manualPriceSource` on `stockProfiles`;
              "Add manual stock" entry point on SPEC-033 Stock inventory page;
              new `manualPrices` collection (user-entered prices, keyed by ticker+date);
              provider-chain short-circuit when `isManual === true`;
              `renameTicker(old, new, fields, mode: 'rename' | 'remap')` — `'remap'` resets
              the wrong identity (drops `apiDividendHistory` + meta + hot caches, replaces
              the profile) while keeping user records (transactions, dividends, watchlist,
              portfolio assignments — renamed when ticker changes, kept in place when not);
              `'rename'` cascades `apiDividendHistory` rows too (latent-bug fix, Sub-phase 32j)

SPEC-033 Stock inventory (extension — Project Phase 4)
  └─ adds:    `confirmed: bool` + `confirmedAt` on `stockProfiles`;
              Price column (lazy live price) + Confirmed column (click to toggle) +
              All/Confirmed/Unconfirmed filter pill in inventory;
              deep-link entry point so SPEC-025 can navigate here pre-filtered to Unconfirmed (Sub-phase 32j)

SPEC-025 Investment CSV import (extension — Project Phase 4)
  └─ adds:    stub `stockProfile` upsert during commit (one per imported ticker, `confirmed: false`);
              post-commit "needs confirmation" card on the Done screen with deep link into
              SPEC-033 Stock inventory pre-filtered to Unconfirmed (Sub-phase 32j)

**Key takeaway:** SPEC-002, SPEC-003, and SPEC-004 are pure data producers — everything downstream depends on them. SPEC-005 is both a producer and consumer. SPEC-009 is envelope-only (no account link) and writes to SPEC-004. SPEC-013 bridges planned items to real account transactions (SPEC-005).

**Phase 2 key takeaway:** SPEC-017 Currency conversion and SPEC-027 Market data are the two foundational utilities that almost every Investments spec depends on — build them first. **SPEC-018 (investing accounts + cash balances + cash movements) is the single bridge between the Investments module and budgeting**: only deposits and withdrawals create linked SPEC-005 transactions; buy/sell/dividend no longer write to SPEC-005 directly. This means the user's flow is "deposit cash into the investing account → use that cash to buy/sell → withdraw cash back to budgeting when wanted," and every intermediate stock transaction is internal to Investments. SPEC-016 Data portability reads and writes *everything* (including `cashBalances` and `cashMovements`) — it should be implemented last in Phase 2 so it covers all the new data shapes.

**Phase 3 key takeaway:** Two foundational pieces gate everything else. (1) **Historical-FX snapshotting on every transaction** (item 146, originally deferred from Phase 10) moves from "deferred" to a hard prerequisite — XIRR p.a. return and cross-currency fee-inclusive avg price both need it. (2) **`apiDividendHistory`, a persistent (non-evicting) collection of API-fetched per-share dividend records,** unlocks correct TTM yield, forward yield, the Dividend page calendar, and CAGR metrics. User dividend records (gross/net, share count, tax) stay where they are — they're consulted alongside the API cache through a union-at-read-time pattern. The two new specs (SPEC-032 Dividend page, SPEC-033 Stock inventory) plus extensions to seven existing specs are organised into Phases 25–31; each phase is scoped to one screen or feature surface so individual implementation sessions stay small.

**Phase 4 key takeaway:** Phase 32 is the first time the planning-screen pattern lands in this app — every other Investments screen is a *record-keeping* screen showing realized state, while Buy-Sell Planning is a *what-if* screen with **no impact on real data until the user explicitly executes a row**. To support that, the screen reuses every existing data primitive (cash balances, FX rates, lot history, dividend cadence, stock profiles, fee defaults) and adds only one new persistent collection (`tradingScenarios`) plus one new settings shape (`tradingFees`). The other Phase 32 items are surgical fixes to existing specs — the lot-quantity bounds, dividend auto-fill, single-line list, fullscreen z-index — that were uncovered during user testing on 2026-05-10 and would otherwise block Phase 32 adoption.

---

## Phase 1 — Finish core data entry (foundation everything else builds on)

> **Phase 1 complete.** Moved to Phase 5b (SPEC-013): recurring engine (auto-create + backfill) and edit/cancel recurring — these are now planned items managed by Bills & Income.

---

---

## Phase 7 — Deployment (post-MVP)

> **Phase 7 complete (desktop).** Tauri desktop installer done — all desktop acceptance criteria in SPEC-010 are met. Mobile (Capacitor/Android) and auto-update are deferred: mobile will be revisited in Phase 21 (Mobile Investments parity); auto-update is deferred until a distribution channel is chosen.

---

# Project Phase 2 — post-MVP enhancements

> Derived from `project goal.md` → PHASE 2 ENHANCEMENTS, fully scoped through the Q1–Q18 design decisions recorded during review on 2026-04-22. Build order respects dependencies: **UI + data portability are independent; Currency conversion (Phase 10) and Market data (Phase 11c) must exist before any Investments feature; Reports and CSV import depend on Stock transactions; Mobile parity is deferred to the end.**

## Phase 8 — Desktop & form layout enhancements

> Make the app usable on desktop (full-width, multi-column on high-value screens) and let users enter records without losing context.

### SPEC-015 UI Enhancements — all items

**Sub-phase 8a — Responsive desktop layout**
126. [x] Remove mobile-width container on desktop; content stretches to viewport (1600px max-width guard)
127. [x] Dashboard: multi-column widget grid on desktop (cards in 2-col grid; widgets in auto-fill grid)
128. [x] Envelope list: tree pane + detail pane split on desktop
129. [x] Transaction list: filters sidebar + list split on desktop
130. [x] Investment reports (Phase 17): charts + table side-by-side on desktop — implemented
131. [ ] Stock page (Phase 14): price chart + metadata in one row, transactions + dividends below — deferred to Phase 14
132. [x] Other screens (Settings, single forms, Categories, Accounts, Scheduled Transfers, Bills & Income, Planning): widen container only
132a. [x] Desktop top-nav sub-row: Investments and More no longer use dropdowns on desktop; a persistent 38 px second row appears below the main header bar when either group is active, showing sub-items as horizontal tab buttons. Investments group: Investments overview · Portfolios · Watchlists · Benchmarks. More group: Planning · Category Budgets · Scheduled Transfers · Bills & Income · Categories · Settings (nav tabs) + Save to file · Load from file (action buttons, right-aligned). Primary tabs with no sub-items hide the sub-row. Mobile BottomNav dropdown behaviour unchanged.

**Sub-phase 8b — Forms in separate space (desktop inline expansion)**
133. [x] Shared inline-form expansion component: empty row at top of a list expands into a form; collapses on save/cancel
134. [x] Desktop: inline expansion for new transaction, new envelope transfer, new scheduled transfer, new planned item, new budget (investing account, stock transaction, dividend deferred to their phases)
135. [x] Mobile: continue dedicated-route pattern (unchanged)

---

## Phase 9 — Data portability (save/load to file)

> **Phase 9 complete.** Save to file and Load from file implemented in the More menu (both mobile and desktop). File format version `rmoney-data-v1`. All SPEC-016 acceptance criteria met.

---

## Phase 10 — App-wide currency conversion

> **Phase 10 complete.** All budgeting screens (Dashboard, Transactions, Envelopes, Budgets, Planning) show main-currency totals. Historical-rate snapshotting was deferred from Phase 10 and is now scheduled in Phase 25 sub-phase 25a (items 260–263).

### SPEC-017 Currency Conversion — historical FX snapshotting
146. [x] Historical-rate snapshotting on investment transactions — implemented in Phase 25a (items 260–263). `snapshotFxRates()` captures rate at write time; `backfillFxSnapshots()` populates existing records.

---

## Phase 11 — Investments foundation

> **Phase 11 complete.** Investments nav, home screen, investing-accounts CRUD, cash balances CRUD, deposit/withdraw/exchange forms (including simplified cross-currency handling), negative-balance policy, linked-transaction integrity (delete cascade, blocking in Transactions screen, click-to-open), and portability all implemented. Deferred items below require Phase 12 (stock transactions) or later.

### SPEC-018 — deferred items

148a. [x] Investments home: include **positions** rollup per account — shows "N stocks" count per card; cash balances labelled "Cash:"; market-value total deferred to SPEC-027
152. [ ] Optional reference to default CSV import template on investing account (deferred to Phase 18)
152c. [ ] Auto-create a cash balance when a buy/sell/dividend needs a currency not yet in the account (deferred to SPEC-019 / SPEC-020)
152j-full. [ ] Cross-currency deposit full model: land amount in a matching-currency cash balance (auto-created if needed) then bundle an auto-exchange to the destination currency — replaces the current single rate-field approach (deferred)
152m-full. [ ] Cross-currency withdrawal full model handled symmetrically (deferred)
152o. [x] Standalone exchange now writes a `stockTransactions` parent record of type `currency-exchange` via `createCurrencyExchange`; old exchanges created before Phase 12e have `linkedExchangeId` only and continue to render correctly

### SPEC-027 Market Data Integration — all items

**Sub-phase 11c — Market data API integration**

> Implementation order: items below are split into **Pass 1** (foundational + immediately fixes the BYG / European-stocks gap) and **Pass 2** (defensive depth). Pass 2 can wait until Pass 1 ships and is validated.

***Pass 1 — foundations + chain v1***
153. [x] Provider chain with failure-only fallback: IBKR → Yahoo Finance → Massive → Twelve Data → Finnhub → Alpha Vantage → Stooq (chain slots are wired even for Pass 2 providers, but Pass 2 adapters are stubs in Pass 1)
153a. [x] Each call logged **immediately** on completion (not batched after success), so the debug panel always reflects true chronological order
153b. [x] In-flight deduplication (`_inFlight` Map + `dedup()` helper) on `getLatestPrice`, `getHistoricalSeries`, `getNews`, `getMarketProfile`, `searchSymbols` — prevents duplicate concurrent network calls (critical for React StrictMode double-mount in dev)
153c. [x] Timestamp column (`yyyy-mm-dd hh:mm:ss`) added as the first column of the debug log table in Settings → Market data tab
154. [x] Settings UI (More → Settings) for each provider: enabled flag, credentials (OAuth for IBKR, API key for keyed providers, no credentials for Yahoo / Stooq); test-connection button per provider
155. [x] Manual price override per stock — wins over all API sources (Q5)
156. [x] Unified request interface for: latest price, historical price series, dividends, corporate actions (splits), news, forex pairs, benchmark index series
157. [ ] Stock lookup returns HQ country (for Q7/D region derivation) when available — partial: Yahoo + Massive return it; TwelveData + AlphaVantage unverified
157a. [x] Price-unit normalisation at the provider boundary: minor-unit currencies (`GBp`/`GBX`, `ZAc`/`ZAX`, `ILA`) are divided by 100 and the currency is upgraded to the major-unit ISO code (`GBP`, `ZAR`, `ILS`) before leaving the adapter — applies to `getLatestPrice`, `getHistoricalSeries`, `getDividends`, `getIndexSeries`, `getStockProfile`. Single shared helper. Caches store normalised values only.
157b. [x] Exchange-code resolution + per-provider translation: shared `resolveExchange(input)` helper maps any synonym (full name, MIC, plain code) to a canonical MIC; each adapter then translates the MIC into the format that provider expects (`LSE` on Twelve Data, `.L` suffix on Yahoo, `.UK` suffix on Stooq, …) and throws to fall through if the MIC isn't supported. Mapping table lives in one shared module. Does not write back to SPEC-029 stock profiles.
157c. [x] HTTP transport abstraction (`marketDataFetch`): per-provider `requiresProxy` flag selects plain `fetch` (Massive, Twelve Data, Finnhub, Alpha Vantage) or proxied transport (Yahoo, Stooq). Tauri build uses `@tauri-apps/plugin-http` with capability allowlist for `query1.finance.yahoo.com` + `stooq.com`; Vite dev uses `server.proxy` block in `vite.config.js` (`/__yfproxy` → Yahoo, `/__stooq` → Stooq). Throws `"transport unavailable"` to fall through if no proxied transport is configured. No public CORS proxies.
157d. [x] **Yahoo Finance adapter** — implements `getLatestPrice`, `getHistoricalSeries`, `getCorporateActions`, `getStockProfile`, `getForex`, `getHistoricalForex`, `getIntradaySeries`, `getIndexSeries`, `searchSymbols`. Uses `query1.finance.yahoo.com/v8/finance/chart/{ticker}{suffix}` for prices; chart `events=split` for splits. Suffix derived via `resolveExchange` (`.L`, `.DE`, `.PA`, `.AS`, `.MI`, `.MC`, `.ST`, `.HE`, etc.). `getNews` throws `'not supported'` (Yahoo's news endpoint is unstable). `getDividends` throws `'not supported'` so the chain falls through to Twelve Data / Massive — Yahoo's chart `events=div` payload lacks payment date and declared/future events, so a partial response would block richer providers (see SPEC-020 + SPEC-027).
157e. [x] **Massive adapter** (replaces stub) — implements all nine methods against `api.polygon.io` paths (Massive is rebranded Polygon; same API). `/v3/reference/tickers/{ticker}`, `/v2/aggs/ticker/{ticker}/prev`, `/v2/aggs/ticker/{ticker}/range/...`, `/v3/reference/dividends`, `/v3/reference/splits`, `/v2/reference/news`, `/v2/aggs/ticker/C:{from}{to}/prev` for forex. Auth via `?apiKey=` query param. Exchange prefix `{MIC}:{ticker}` for international stocks.

***Pass 1.5 — symbol search & canonical storage*** *(new — addresses ticker-format ambiguity like `SGRO` vs `SGRO.L`, dual-currency listings on a single exchange, and same-ticker-different-exchange clashes)*
157h. [x] Chain-level `searchSymbols(query)` method — calls every enabled provider in parallel, normalises each result, and merges by `(ticker, exchange, currency)` with the `source` field coalescing provider names ("Yahoo + Massive").
157i. [x] Provider-level `searchSymbols` adapters: Yahoo, Massive, Twelve Data implemented. Finnhub search results lack exchange/currency so falls through. AlphaVantage uses non-standard region strings + suffixes (.LON, .DEX) that can't be cleanly normalised — falls through. Stooq + IBKR throw "not supported".
157j. [x] Defensive suffix-stripping via `stripProviderSuffix(ticker)` in `marketDataExchanges.js`: strips Polygon-style `XLON:` prefix and Yahoo-style `.L` / `.DE` suffixes. Applied in `yfTicker`, `polyTicker`, `tdSymbol` before appending provider-specific format.
157k. [x] SPEC-029 dialog wired to `searchSymbols`: runs market data search and AI in parallel; market data candidates appear first; AI candidates follow as fallback; both sources run to completion; auto-selects first market candidate, then first AI candidate, then manual if all empty. Currency column always shown.
157l. [x] On confirm, `stockProfile` upserted with the canonical triple (bare ticker, MIC stockExchange, major-unit ISO currency). resolvedSource set to 'market', 'ai', or 'manual'.

***Pass 2 — defensive depth***
157f. [ ] **Finnhub adapter** — implements `getLatestPrice`, `getStockProfile`, `getNews`, `getDividends`, `getForex`. Auth via `?token=` query param. Symbol format uses the suffix style for non-US (`BYG.LON`, `SAP.DE`). News is the strongest reason to keep Finnhub in the chain.
157g. [ ] **Stooq adapter** — implements `getLatestPrice` and `getHistoricalSeries` only. CSV endpoint `https://stooq.com/q/l/?s={ticker}{suffix}&f=sd2t2ohlcv&h&e=csv` for spot quote; `/q/d/l/?s=...&i=d` for daily history. Dividends / news / profile / corporate-actions methods throw `"not supported"` so the chain falls through. Uses the same proxy transport as Yahoo. Suffix table mirrors the canonical MIC → Stooq mapping.

---

## Phase 12 — Stock transactions (buy, sell, transfer, split, currency exchange)

> Core lot-affecting transactions with correct cost-basis and multi-currency tracking (Q10, Q14, Q15). Buys and sells now flow through the cash-balance layer (SPEC-018) instead of linking directly to a budgeting account + envelope. A fifth transaction type — **currency exchange** — is introduced to represent the FX step when a buy's source cash balance is in a different currency from the trade (or when the user records a past exchange out of order).

### SPEC-019 Stock Transactions — all items

**Sub-phase 12a — Buy records**
158. [x] Fields: date, stock exchange (optional), ticker, shares, price, currency, transaction ID (optional), fee (default 0)
159. [x] **Source cash balance:** automatically matches the trade currency; auto-created with opening 0 if absent
159a. [x] Auto-create a cash balance with opening 0 when the trade currency has no balance yet in the investing account
159b. [ ] Cross-currency source triggers a companion `currency-exchange` record — deferred to Phase 12e
160. [x] Snapshot exchange rates at transaction date — implemented in Phase 25a
160a. [x] Saving a buy writes `cashMovement` rows: one `buy` debit for `shares × price` and one `buy-fee` debit for `fee` (when fee > 0)
160b. [x] Negative-balance confirmation (SPEC-018) applies when the resulting balance would go below 0
161. [x] Weighted-average price calculation across remaining open lots (display only in Positions section)

**Sub-phase 12b — Sell records**
162. [x] Fields: same as buy + lot picker; ticker selected from open positions
163. [x] Lot-picker UX: FIFO default, "Advanced: choose lots" disclosure expands into per-lot editable quantities
164. [ ] **Proceeds destination cash balance selector** — deferred; currently always uses matching-currency balance
164a. [x] Saving a sell writes `cashMovement` rows: one `sell` credit for `shares × price` and one `sell-fee` debit for `fee` (when fee > 0)
165. [ ] Retroactive cost-basis recalculation on buy edits — deferred

**Sub-phase 12c — Transfers between investing accounts** *(complete)*
166. [x] Partial transfer with lot selection (FIFO default + override picker) — `TransferForm` in `InvestingAccountDetail.jsx` with same lot-picker UX as `SellForm`
167. [x] Cost basis and buy dates preserved on moved lots — destination-side lots synthesized at calc time from the transfer's `lotAllocations`, copying source buy's date/price/currency
168. [x] **No cash moves with the transfer** — `createTransfer()` writes only the stockTransactions record
168a. [x] Optional fee → debited from a user-picked cash balance in the source investing account; writes a `transfer-fee` cashMovement (negative-balance confirmation hook for transfer fees deferred)

**Sub-phase 12d — Splits** *(manual entry done; API detection deferred to SPEC-027)*
170. [ ] API-detected splits presented as a pending notification ("Detected 2:1 split on AAPL — apply?") (Q14/C) — *deferred to SPEC-027*
171. [x] On confirm: multiply shares and divide per-share cost basis on all open lots of the stock in every investing account — implemented via calc-at-read-time in `getOpenLots()`; preserves original buy records and translates pre-split sell allocations into post-split basis
172. [x] Manual split entry form as fallback for API-missed events — `+ Split` button on Stock page Positions section; date + numerator/denominator with live forward/reverse hint
172a. [x] Splits have no cash-balance effect — `applySplit()` writes only stockTransactions records

**Sub-phase 12e — Currency exchange (new transaction type)**
172b. [x] Record shape: single `stockTransactions` record with `type: 'currency-exchange'`, storing sourceCashBalanceId, sourceAmount, targetCashBalanceId, targetAmount, exchangeRate, optional fee with own currency, and `triggeredByStockTransactionId` (null for standalone exchanges)
172c. [x] Writes two `cashMovement` rows (source debit + target credit) and one more for the fee when present; both cash movements carry `linkedStockTransactionId` so `deleteStockTransaction` cleans them up
172d. [x] Standalone exchanges (no `triggeredByStockTransactionId`) appear only in SPEC-018 cash-movement list with delete and edit support; triggered-by-buy path deferred
172e. [x] Editing a standalone exchange (date, amounts, rate, fee) re-creates both `cashMovement` rows; triggered-by-buy edit path deferred (deferred: `triggeredByStockTransactionId` edit and buy-total update)

---

## Phase 13 — Dividends

> **Phase 13a + 13b (partial) complete.** Dividend records, cash landing, bidirectional tax form, global default tax %, per-stock override implemented. Per-country tax (needs SPEC-027) and projections (Phase 14) deferred.

### SPEC-020 Dividends — deferred items

**Sub-phase 13b — Per-country tax (deferred)**
178. [ ] Per-country tax %; country = HQ country of the stock by default, manually overridable per stock (Q9/a) — *deferred to after SPEC-027 market data integration*

**Sub-phase 13c — Future payout projections (deferred to Phase 14)**
181. [x] Next 4 payout dates projected from historical cadence (≥ 2 payouts; snapped to monthly/quarterly/semi-annual/annual)
182. [x] Amount estimation rule per-stock + global default: last-paid / year-ago / manual; per-stock dropdown on stock page
183. [x] State badges: estimation (all local), amount estimated + declared reserved for future API integration

---

## Phase 14 — Stock page

> **Phase 14 mostly complete.** Positions, transactions list (all filter types), dividend history, portfolio memberships, live price, price chart, news, and AI panel are all built. Remaining deferred: stock-exchange selector (#185), metrics row (#187), dividend projections (#189a).

### SPEC-021 Stock Page — deferred items

184. [x] Header: latest price (built — live price row with provider attribution)
185. [ ] Stock-exchange selector — deferred (profile exchange shown as text; changing it requires resolution dialog)
186. [x] Price chart with period selector (built — SVG chart with 1M/3M/6M/1Y/5Y/All periods)
187. [x] Metrics row: market value, total return + %, p.a. return, price-appreciation, dividend return, div yield TTM
188a. [x] Transactions list: transfer, split, exchange filter types (built — all 7 filter types in FILTERS array)
189a. [ ] Dividend section: next 4 projected payouts (Phase 13c — deferred)
190. [x] Top 5 news items (built — news section with 15-min cache)
191. [x] Right-column AI panel slot (built — AiChatPanel always rendered in rightCol)

---

## Phase 15 — Portfolios (allocation groups)

> **Phase 15 complete.** CRUD, nested tree, many-to-many assignments, target % with sibling validation warnings, DnD reparenting, up/down reordering, cascade-delete preview, and portability all implemented.

### SPEC-022 Portfolios — deferred items

*(No deferred items — all Phase 15 acceptance criteria implemented.)*

---

## Phase 16 — Benchmarks ✓ COMPLETE

> **Phase 16 complete.** Benchmarks screen implemented: curated list (S&P 500, NASDAQ 100, MSCI World, FTSE 100, Euro Stoxx 50, PX), user-added CRUD, whole-portfolio / per-Portfolio / per-stock scope, SVG chart with two indexed-to-100 series (blue = my series, green = benchmark), stats table (total return, p.a., volatility), period selector (1M–All). `portfolioHistory.js` utility computes weighted daily portfolio value using current positions + historical prices + current FX rates. User-added benchmarks registered in Settings → Storage tab. See SPEC-023 (status: done).
>
> **Post-ship bug fix:** `computeMySeries` (whole-portfolio and per-portfolio scopes) now trims the date range to start from the **effective start date** — the latest first-data-date across all held tickers. This prevents the "vertical line" rendering artifact caused by early dates where only a subset of positions had price data, which made the index denominator reflect partial coverage and inflated all subsequent indexed values.

---

## Phase 17 — Investment reports ✓ COMPLETE

> **Phase 17 complete.** Investment Reports screen implemented: position table with 19 configurable columns, type filter (Stocks live + 5 placeholder types), saved named presets (create/update/rename/delete), four breakdown views (currency, country-detail region, continent region, portfolio) each with Chart (SVG pie) and Table modes, side-by-side desktop layout, grand total bar including positions + cash balances, per-stock HQ country inline edit for region attribution, main-currency conversion throughout, storage registered in Settings → Storage tab. See SPEC-024 (status: done).

---

## Phase 18 — CSV import for investment transactions

> **Phase 18 complete.** Named templates, per-account default, first-import column-mapping wizard, subsequent-import fast path, preview with row-level validation, dedup by external ID, and atomic commit with rollback all implemented. Template rename + delete lives in Settings → Import Templates. Column-mapping edits require re-importing with the manual mapping path.

---

## Phase 19 — AI evaluation integration ✓ COMPLETE

> All Phase 19 items done. Settings has four tabs: General / Investments / AI / Storage. AI tab holds the connection card and System Prompts manager. Stock page has a two-column layout with the AI chat panel always in the right column. Multi-turn chat, prompt caching (Anthropic), per-stock retention (3 unpinned + unbounded pinned), and storage transparency are all built. Storage tab (Settings → Storage) consolidates all localStorage usage cards: Watchlists and AI chat storage. CLAUDE.md data persistence convention points to this tab for all future features. See SPEC-026 (done).

---

## Phase 20 — Future asset classes (placeholders, not built in Phase 2)

> Reserved slots in the investment-type filter so reports UI is complete from day one. Each asset class gets its own spec round later with type-specific fields and lifecycle (Q12/A).

220. [ ] **Options** — strike, expiry, underlying, exercise/assignment lifecycle, greeks tracking
221. [ ] **Bonds** — coupon, yield, maturity, accrued interest, amortization
222. [ ] **Crypto** — wallets, network transfers, cost basis (may reuse stock model)
223. [ ] **Precious metals (storage)** — quantity, weight unit, purity, storage cost, no yield
224. [ ] **Precious metals (lease)** — counterparty, lease rate, payout cadence, principal return date

**Specs to create:** one per type — deferred.

---

## Phase 21 — Mobile Investments feature parity (deferred)

> Phase 2 ships mobile Investments as entry + summary only (Q5b/Option 2). This phase brings full parity.

### SPEC-010 Deployment — mobile (Capacitor) prerequisites

363. [ ] `npx cap add android` + `npx cap open android` opens Android Studio with the project ready to build (SPEC-010 mobile acceptance criterion)
364. [ ] App data persists locally on the device (SPEC-010 mobile acceptance criterion)

### SPEC-028 Mobile Investments Parity — all items

225. [ ] Stock price chart on mobile
226. [ ] Top 5 news on mobile
227. [ ] AI evaluation on mobile
228. [ ] Full Investment reports on mobile
228a. [ ] Watchlists & alerts on mobile (SPEC-030 parity, including the Investments dropdown menu)
228b. [ ] Tauri local notifications for watchlist alerts on mobile (SPEC-030 Phase B — runtime upgrade only, data model unchanged)

---

## Phase 22 — Stock profile resolution (SPEC-029)

**Pass 1 — core flow (done):** Resolution dialog with AI + manual fallback, Direction A (ticker→name) and Direction B (name→ticker), integrated into buy form and stock page.

**Pass 2 — price visibility + ticker rename**

157m. [x] Price column in resolution dialog (Refresh profile + Resolve profile): call `getLatestPrice` per candidate in parallel; price renders when it arrives; "—" if unavailable; manual entry row shows no price
157n. [x] "Rename ticker" button on StockPage header — always visible alongside Refresh/Resolve profile
157o. [x] Rename step 1 — input dialog: current ticker shown as context; new ticker field + "Look up" button; triggers `searchSymbols(newTicker)` + `getLatestPrice(newTicker)` in parallel
157p. [x] Rename step 2 — confirmation: single candidate → summary card (name, exchange, currency, price + irreversibility warning + [Cancel] [Rename]); multiple candidates → full picker dialog with price column and "Rename" confirm label; zero candidates → card with new ticker only + same warning
157q. [x] `renameTicker(oldTicker, newTicker, profile)` in `stockProfiles.js`: cascades rename across `stockProfiles`, `stockTransactions`, `dividends`, `watchlistEntries`, `portfolioAssignments`; upserts resolved profile on new ticker; clears price cache for old ticker
157r. [x] After rename, StockPage navigates to the new ticker

---

## Phase 23 — Watchlists & alerts ✓ DONE

> SPEC-030 fully implemented: Investments nav dropdown, watchlists CRUD, stock entries, price-threshold alerts with armed/triggered lifecycle, in-app banners, Settings storage card, portability. See SPEC-030 (status: done). Live price evaluation is a no-op until SPEC-027 is built.

---

## Phase 24 — Security & secrets handling (must precede first Git push)

> SPEC-031 — protect the user's API keys (market data, AI) and prepare the repo for public Git publication. Cross-cuts SPEC-016 (data portability), SPEC-026 (AI connection), and SPEC-027 (market data). Items below are gated on user agreement of the SPEC-031 acceptance criteria.

### SPEC-031 Security and secrets handling — all items

**Sub-phase 24a — In-app handling**
229. [x] API key inputs `<input type="password">` with non-persistent "Show" toggle (Settings → Market data tab + AI tab)
230. [x] After-save placeholder masks key length (fixed bullets, not the real length)
231. [x] "Test connection" results never echo the URL or key — short outcome strings only (`sanitiseTestError` strips URL patterns, caps at 100 chars)
232. [x] Delete-connection / clear-key paths drop the value from localStorage and any in-memory cache
233. [x] Subtitle note on Market data + AI tabs about local-storage and screenshot risk
234. [x] Provider-adapter error path strips URL/query string from any error before it is logged or thrown
235. [x] `marketDataLogger` invariant: `entry.reason` never contains `apikey`/`apiKey`/`token=` (enforced by dev-mode assertion in `logCall`)
236. [x] Caches (priceCache / forexCache / newsCache / profileCache) hold only response data, never URLs or keys

**Sub-phase 24b — Tauri hardening**
237. [x] `tauri.conf.json` CSP set to strict static base covering all market-data hosts + known AI API hosts (Anthropic, OpenAI). Replaces `"csp": null`.
237a. [ ] Runtime meta-tag CSP injection deferred — meta tags can only restrict, not expand, existing policy; custom AI host support requires Tauri HTTP plugin (Phase 24e) or static CSP update per provider addition.
238. [x] `@tauri-apps/plugin-http` added (`Cargo.toml` + `lib.rs` + `capabilities/http.json`); allowlist restricted to `query1.finance.yahoo.com` and `stooq.com` only
239. [x] Capability set confirmed minimal — default.json unchanged; HTTP capability is in separate `capabilities/http.json`

**Sub-phase 24c — Data portability hardening (extends SPEC-016)**
240. [x] Save-backup dialog adds Sharable / Full radio (Sharable selected by default); Sharable redacts every key + OAuth token to `"[REDACTED]"` and sets `_redacted: true`
241. [x] Load handles redacted backups: restores all data except credentials, surfaces "keys not restored" toast pointing at Settings
241a. [ ] Full Backup mode prompts for the master passphrase before producing the file; embeds the Stronghold vault bytes base64-encoded under `_strongholdVault`. Receiving install prompts for the same passphrase on load. **Deferred to sub-phase 24e (requires Stronghold infrastructure)**

**Sub-phase 24d — Git publication readiness**
242. [x] Root-level `.gitignore` covering: data files at root (`*.csv`, `*.rmy`, allowlisted JSON configs), `.env*`, `*.log`, editor / OS noise, build outputs (`node_modules/`, `dist/`, `app/src-tauri/target/`, `app/src-tauri/gen/schemas/`), local agent dirs (`.claude/projects/*/memory/`, `.obsidian/`), and the Stronghold vault file (`*.stronghold`)
243. [x] Resolve `Import_test.csv` at root — moved to `fixtures/Import_test.csv` (confirmed fabricated test data)
244. [x] Pre-commit hook in `scripts/git-hooks/pre-commit` (registered via `core.hooksPath`) blocking obvious key-shaped strings
245. [x] `scripts/pre-publish-audit.sh` (+ `.bat`) running working-tree + `git log --all -p` regex sweep + tracked-file check; non-zero exit on findings; `npm run audit:pre-publish` script
245a. [x] **Pre-push hook** in `scripts/git-hooks/pre-push` running the audit script automatically on every push; non-zero exit blocks the push
246. [x] README section: cloning + key configuration; `.rmy` warning; dev-server proxy explanation; encrypted-vault explanation
247. [x] Manual one-time pre-publication run of the audit script before first `git push` — passed clean (no FAIL findings; `.gitignore` updated to add `*.env`)

**Sub-phase 24e — Encryption at rest (Stronghold)**
248. [x] Add `tauri-plugin-stronghold` to `Cargo.toml` and register in `lib.rs` with SHA-256 KDF. Vault path at OS app-data dir via `appDataDir()`. Capability file `capabilities/stronghold.json` created.
249. [x] First-launch passphrase setup modal (`PassphraseSetup.jsx`): passphrase + confirmation, minimum 12 chars, explanation that loss = re-enter keys.
250. [x] Migration path: `migrateKeysToVault()` in `secrets.js` — reads existing raw API keys from `rmoney_settings`, moves to Stronghold, replaces with `apiKeySet: true` flags.
251. [x] Subsequent-launch unlock modal (`PassphraseUnlock.jsx`): passphrase entry, 3-attempt limit → locks form; vault opened in `App.jsx` before main UI renders.
252. [x] `secrets.js` module — `getSecret`, `setSecret`, `deleteSecret` + dev localStorage fallback + `openVault`, `deleteVaultFile`, `vaultExists`, `migrateKeysToVault`.
253. [x] `getMarketDataProviders()` now returns `{ ..., apiKeySet: bool }`. `buildProviderCfg(id, cfg)` in `marketDataClient.js` fetches the key from vault per call.
254. [x] `getAiConnection()` returns `{ ..., apiKeySet: bool }`. `AiChatPanel.jsx` and `StockProfileResolutionDialog.jsx` fetch from vault in each request.
255. [ ] When IBKR retail OAuth ships (deferred per SPEC-027), tokens go straight to Stronghold under `marketData/ibkr/oauth/{accessToken,refreshToken}`; never localStorage.
256. [x] Settings UI: "Show key" fetches from Stronghold on click, displays while toggled, clears on Hide. Market data and AI key sections both use the mask/show/change pattern.
257. [x] Vite-dev / no-Tauri detection: `secrets.js` falls back to `rmoney_dev_secrets` in localStorage; App.jsx renders a persistent dark-orange banner "Dev mode — API keys are stored in plain text."
258. [x] "Forgot passphrase" reset flow in `PassphraseUnlock.jsx`: confirmation screen → clears `apiKeySet` flags → calls `deleteVaultFile()` → transitions to `PassphraseSetup`.
259. [x] Memory hygiene confirmed: market data keys fetched inside `buildProviderCfg()` per call; AI keys fetched inside `sendRequest()` / `callAi()` per request; no long-lived variable holds decrypted key material.

> **Process rule:** the repository remains local-only until 247 is done. A future Claude session that proposes `git push` without confirming the audit must be redirected to this phase. Encryption at rest (24e) does not gate first push but is required before any wider distribution.

---

# Project Phase 3 — Investments enhancements (sourced from `scratch_notes/Investments_enhancements.md`)

> Build order is foundation-first. Phases 25 (data foundation) and 26 (stock lifecycle + transaction edits) unlock everything in 27–31. Phases 27–29 are screen-shaped extensions to existing specs (no new specs). Phases 30–31 introduce the two new specs (SPEC-033 Stock inventory, SPEC-032 Dividend page).
>
> **Granularity convention (Pattern C from design review):** foundation sub-phases are tight (3–5 acceptance criteria each, surgical changes); screen-shaped sub-phases are medium (6–10 criteria, one cohesive UI improvement); new-SPEC sub-phases are split by tab/section. Each sub-phase is intended to fit in one Claude session.

## Phase 25 — Foundation for Investments enhancements

> Pure plumbing. Nothing visible to the user changes after this phase, but every later phase depends on these data shapes existing.

**Sub-phase 25a — Historical FX snapshotting on every transaction (promotes item 146) ✓ DONE**
260. [x] `exchangeRates` field populated on `stockTransactions` (buy/sell/currency-exchange at write time via `snapshotFxRates()`); transfer and split remain null. `exchangeRatesSnapshot` populated on `cashMovements` at write time.
261. [x] `updateCurrencyExchange` accepts and re-stores `exchangeRates`; `handleUpdateExchange` in InvestingAccountDetail re-fetches rates when saving edits.
262. [x] `backfillFxSnapshots()` in `data/stockTransactions.js` walks all existing stock transactions and cash movements, fetches historical rates via SPEC-027, marks records `fxBackfilled: true`. Triggered from Settings → Storage → "Historical FX snapshots" card.
263. [x] Portability unchanged — `exportAppData()` / `importAppData()` already read/write the full record shapes verbatim; snapshot fields are included automatically.

**Sub-phase 25b — Persisted history vs hot cache categorization ✓ DONE**
264. [x] Document the two categories in a header comment in `utils/marketDataCache.js` and in SPEC-016 acceptance criteria. `data/apiDividendHistory.js` created as the home for persisted history.
265. [x] SPEC-016 export rules: Full backup includes persisted-history collections (`apiDividendHistory` and any future `apiPriceHistory`); Sharable backup excludes them; hot caches (price / forex / news / latest-profile) excluded from both. `portability.js` updated with `mode` param; `App.jsx` passes `saveMode`.
266. [x] Settings → Storage tab: "API dividend history" card added with per-ticker breakdown + bulk-clear; Market data cache card now labels itself as "Rebuilds itself — excluded from all backups."

**Sub-phase 25c — `apiDividendHistory` persistent collection ✓ DONE**
267. [x] Schema: keyed by `(ticker, exDate)`. Fields: `payDate`, `perShare`, `currency`, `type: 'regular' | 'special' | null`, `state: 'paid' | 'declared' | null`, `source: 'api' | 'manual'`, `fetchedAt`. Lives in localStorage; no TTL
268. [x] `getDividends(ticker, exchange)` chain method writes results into `apiDividendHistory` (deduping on ex-date); the existing user `dividends` collection is never touched by API refresh. `marketDataClient.getDividends` updated to pass `exchange` to providers; provider adapters (Yahoo, Massive, Twelve Data, Alpha Vantage) updated to accept (and currently ignore) the new parameter
269. [x] Stale-data indicator (amber dot + tooltip): shown in Stock page header when `apiDividendHistory[ticker]` has never been successfully refreshed or last refresh failed; infrastructure (`isStaleForTicker`) exported for future TTM/forward yield tiles (Phase 28b)
270. [x] Auto-refresh skip rule: a future-dated row with `state: 'declared'` and all of `payDate` + `perShare` + `currency` present is preserved during upsert (not overwritten by a subsequent API fetch)
271. [x] Stock page header gets a "Refresh dividend data" button that triggers `refreshApiDividendHistory` for the displayed ticker and writes results immediately; shows "Refreshing…" during fetch and "Refresh failed" on error

**Sub-phase 25d — Dividend type per payout + frequency on stock profile ✓ DONE**
272. [x] Add `type: 'regular' | 'special'` column to the user `dividends` collection (default 'regular'; user-editable on the dividend create form). `createDividend` + `updateDividend` accept `type`; DividendForm has Regular / Special selector; StockPage past-payout rows show a "Special" badge when `type === 'special'`
273. [x] Extend `stockProfiles` with `dividendFrequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'unknown'` (default 'unknown'). `getDividendFrequency(ticker)` helper exported from `stockProfiles.js`. Massive adapter maps `dividend_type` → type and `frequency` → frequency string; `refreshApiDividendHistory` writes the most-common frequency from the batch to the stock profile via `upsertStockProfile`. User-editable from Edit profile in Phase 26b
274. [x] `detectEffectiveDividendFrequency(storedFrequency, { apiHistory, userDividends })` exported from `utils/dividendProjections.js`. Returns stored frequency when known; falls back to cadence detection on merged regular payouts from both sources. Used by Phase 28b forward-yield calculation (item 307)

**Sub-phase 25e — Intraday market data endpoint ✓ DONE**
275. [x] Add `getIntradaySeries(ticker, exchange)` to the provider chain interface; supported by Yahoo (`range=1d&interval=1m`) and Twelve Data (`time_series interval=1min`); Massive / Stooq / IBKR adapters return "not supported" so the chain falls through
276. [x] Hot-cache (TTL ≈ 5 min) the intraday series per ticker; not persisted long-term

**Sub-phase 25f — Soft-delete data model for stockProfiles ✓ DONE**
277. [x] Extend `stockProfiles` with `archived: bool` and `archivedAt`; default `archived: false`
278. [x] Add helpers `getActiveStockProfiles()` / `getArchivedStockProfiles()`; replace every existing `getStockProfiles()` consumer that should hide archived (Buy form, Stock page navigation, dropdowns) with the active variant

---

## Phase 26 — Stock lifecycle UX + transaction edits *(mostly complete — Phase 26a/26b/26c partial/26d done)*

> Extends SPEC-019 (edit transactions, fee-inclusive avg) and SPEC-029 (add-without-buy, edit-profile, re-look-up).
> Items 280–285, 287, 289, 290 are complete and removed. Remaining deferred items below.

**Sub-phase 26a — Add stock without Buy (remaining)**
279. [ ] SPEC-029 resolution dialog in standalone-resolve mode (no transaction context); UI entry point via "Add stock" button on Stock inventory page (Phase 30) — dialog mode implemented, entry point deferred to Phase 30

**Sub-phase 26c — Edit existing stock transactions (remaining)**
286. [ ] Edit form for transfer between investing accounts: change source / destination / lots / fee — `updateTransfer()` data function is implemented; UI edit form deferred
288. [ ] Edit form for currency-exchange triggered-by-buy: completes the deferred triggered-by-buy edit path mentioned in 172e

**Sub-phase 26d — Fee-currency invariant (remaining)**
291. [ ] Fee-currency invariant: **buy and sell forms** validate `feeCurrency === tradeCurrency` and block save with an inline error. A `legacyFeeMismatch: true` flag tags any pre-existing buy/sell record where the invariant didn't hold (UI shows a warning chip on those rows). Buy/sell forms currently have no explicit fee-currency field (fee inherits trade currency), so the invariant is trivially satisfied — this item is the explicit validation + legacy-mismatch chip

---

## Phase 27 — Investing account detail overhaul ✓ COMPLETE

> Extends SPEC-018 (cash movements + footer cleanup) and SPEC-024 (configurable per-account positions table). Builds two shared components used by Phases 28, 29, 31.

**Sub-phase 27a — Hybrid filter dropdown component (shared)**
292. [x] Build `components/HybridFilterDropdown.jsx`: closed pill shows selected count; opened panel has search box + scrollable checkbox list + clear / apply buttons
293. [x] Multi-select returns array of selected ids; supports option-with-secondary-label (e.g. `TICKER` primary + `Name` secondary)

**Sub-phase 27b — Configurable column table (shared) — per-account positions**
294. [x] Build `components/ConfigurableTable.jsx`: column-picker, drag-reorder, sort by visible column, max-height for ~20 rows, fullscreen-expand button
295. [x] Replace the existing per-account positions list with `ConfigurableTable` populated by 14 columns: ticker, name, latest price, currency, exchange, shares, price/share (= avg with fees), avg price (= cost basis), MV trading-currency, MV main-currency, share-on-account %, change (%), change (trading currency), change (main currency)
296. [x] Persist per-account column visibility + order + sort to localStorage (`rmoney_positions_columns_{accountId}`)
297. [x] Session change in three separate visible-by-default columns: % change; trading-currency amount (`perShareChange × shares`); main-currency amount (converted). Yahoo adapter returns `previousClose`. Fullscreen toolbar rendered inside the overlay so the exit button is always reachable.

**Sub-phase 27c — Cash movements: filters + virtualization**
298. [x] Added max-height scrollable container (~30 rows visible); chunk-load 50 records with "Load more" button
299. [x] Filters bar using `HybridFilterDropdown`: type multiselect, ticker multiselect, portfolio multiselect, currency multiselect
300. [x] Filter bar collapses by default behind a "Filters" button; open/closed state persisted in localStorage per account

**Sub-phase 27d — Cash movements readability + footer cleanup**
301. [x] Increased row font size (13→14px); stronger date/type color contrast; alternating stripe on even rows
302. [x] Fullscreen-expand button on cash-movements panel header (CSS-class-driven fixed overlay)
303. [x] Removed the `Portfolios` shortcut button from the bottom of the Investments overview screen

---

## Phase 28 — Stock page enhancements (extends SPEC-021)

> Single biggest screen rebuild in Phase 3. Each sub-phase is one cohesive improvement.

**Sub-phase 28a — Currency view toggle (shared component) ✓ DONE**
304. [x] Build `components/CurrencyToggle.jsx`: pill toggle "Trading | Main"; persists last choice per screen in localStorage
305. [x] Add to Stock page header (defaults to Trading); affects metric formatting (all tiles), dividend past-payout amounts; hidden when trading === main currency. Price chart axis and Positions subtotal deferred to Phase 28e/28c respectively

**Sub-phase 28b — Metrics row overhaul (TTM / forward / dividend return / p.a. XIRR) ✓ DONE**
306. [x] **TTM yield** sourced from `apiDividendHistory[ticker].perShare` for past 12 months ÷ current price. Falls back to user `dividends.dividendPerShare` for dates the API hasn't covered. Amber dot (header) when API cache is stale. Includes **all** dividend types (regular + special). **Cost-based variant** (`TTM on cost`) uses weighted-average fee-inclusive cost per share as the denominator instead of price.
307. [x] **Forward yield** = `lastRegularPerShare × frequencyMultiplier ÷ currentPrice`; frequency from `detectEffectiveDividendFrequency`; merged user-records + API-cache view (user wins on `(ticker, exDate)` collision, so user-edited `type='special'` correctly excludes it from forward-yield input); shows "—" when frequency = 'unknown' or no regular history. **Cost-based variant** (`Fwd on cost`) uses weighted-average cost per share.
308. [x] **Dividend return** split into two tiles: "Div return (all-time)" and "Div return (L12M)"; both show gross primary, net after tax in subtitle.
309. [x] **P.a. return** rebuilt as **XIRR** (`utils/xirr.js` Newton-Raphson) over buy/sell/dividend/terminal-MV cash flows in main currency; buy/sell use snapshot FX `rateToMain`, falling back to live rate when no snapshot present; dividends use live rate; shows "—" only when both unavailable.
310. [x] Total return formula corrected: `totalReturn = (MV − totalInvested) + netDividends`; price-appreciation (= `MV − totalInvested`) verified correct across multiple lots.
311. [x] **Yield-tile info popups (`YieldDetailDialog`):** ⓘ button on every yield tile opens a modal showing the full breakdown — for TTM, every dividend in the 12-month window with type, source, per-share amount and total; for Forward, the single most-recent regular payout used. Denominator (price or cost) shown explicitly with the formula and 4-decimal result.

**Sub-phase 28c — Multi-account total row + portfolio % share ✓ DONE**
311. [x] Stock page Positions section: when same stock is in ≥ 2 investing accounts, append a bold subtotal row showing total shares, weighted-avg fee-inclusive price, total MV
312. [x] Portfolio memberships table: add `% share` column = position MV ÷ portfolio total MV × 100, refreshed live with latest price; keep the existing target % column

**Sub-phase 28d — Past payouts + transactions tables: scroll + lazy load ✓ DONE**
313. [x] Past payouts table: max-height for 15 rows. Initial render shows the most recent payouts at the top; scrolling down loads chronologically older year chunks (one year per chunk). Merges user `dividends` and `apiDividendHistory` rows, deduped by `(ticker, exDate)` with the user record taking precedence (user `type` and `perShare` win; the API row is hidden when both exist for the same date). This same precedence rule feeds the forward-yield input (item 307)
314. [x] Transactions table: max-height for 15 rows; standard scroll (transaction count is bounded — no chunking needed)

**Sub-phase 28e — 1D chart period ✓ DONE**

**Sub-phase 28f-i — Future dividend declarations + projections + manual editing (initial scope) ✓ DONE**
316. [x] Stock page Dividends section: render next 4 expected payouts from `apiDividendHistory` (`state: 'declared'`) plus the projection algorithm (`state: 'estimated'`, computed at read time). The projection algorithm excludes special dividends from cadence detection and per-share amount estimation (per SPEC-020) — declared specials in `apiDividendHistory` still render as themselves but are not extrapolated forward
317. [x] Visual distinction: declared = solid green-tinted border + "Declared"/"Manual" badge; estimated = dashed border + "Est." badge
318. [x] Edit button on past user dividend rows opens `EditDividendDialog` (per share, tax %, type); "→ Declare" button on estimated rows opens `ConvertToDeclaredDialog` which writes to `apiDividendHistory` with `source: 'manual'`. Post-payout dedup is automatic via the existing merge-dedup rule

**Sub-phase 28f-ii — Section layout, columns, and standalone declare (extension) ✓ DONE**
319. [x] **Estimated projections merge `apiDividendHistory` as a fallback data source.** `computeProjections` reads from the merged user-`dividends` + `apiDividendHistory` set (user wins on `(ticker, exDate)` collisions, specials excluded).
320. [x] **Section visibility extended.** Dividends section renders whenever `totalShares > 0`.
321. [x] **Standalone `+ Declare` button** on the Dividends section header.
322. [x] **Unified dividend list with visual divider.** Future rows first (ascending) → `Today — YYYY-MM-DD` divider → past rows (descending). Single scrollable table.
323. [x] **Tabular column structure.** Column headers: `Ex-div date | Payout date | Per share | Net | Source | (actions)`. Subline for tax %, shares, account name.

**Sub-phase 28g — Enter buy / sell / dividend from stock page ✓ DONE**

---

## Phase 30 — Stock inventory page (NEW SPEC-033) ✓ COMPLETE

> Lists every included stock; first home for the soft-delete archive lifecycle.

### SPEC-033 Stock inventory — implementation
> All acceptance criteria below are tracked through the sub-phases of Phase 30.

**Sub-phase 30a — Inventory list**
335. [x] New page accessible from the **More menu** (desktop top-nav second-row + mobile More dropdown), alongside `Categories / Settings`
336. [x] Lists all `stockProfiles` (active + archived togglable). Columns: ticker, name, exchange, currency, HQ country, dividend frequency, archived flag, history-presence indicator (transaction count, dividend count, in-portfolio count, in-watchlist count) — all clickable links to the filtered list of those records
337. [x] Per-row actions: Edit profile (Phase 26b), Archive / Unarchive, Permanent delete (button only enabled when all four counts are zero)
338. [x] "Add stock" button on the page launches the SPEC-029 resolution dialog in standalone mode (Phase 26a)
338a. [x] Sortable columns; sort choice persisted in localStorage. Default when no choice has been made: ascending alphabetical by ticker
338b. [x] History-presence counts computed once on page mount as four `{ticker → count}` maps (single pass per source collection); rows read from maps in O(1). Maps refresh when the active/archived filter changes, not memoised across navigations

**Sub-phase 30b — Archive lifecycle + click-through to records**
339. [x] Archive precondition: zero open lots. The Archive button is disabled with a tooltip "Sell all positions in this stock before archiving" when any open lot exists. When precondition holds, Archive sets `archived: true` and `archivedAt: now`.
340. [x] Unarchive: clears the flags; stock reappears everywhere
341. [x] Click-through deep links from each row navigate to the relevant filtered list (Transactions filtered by ticker, Dividends filtered by ticker, Portfolio editor for the relevant portfolio, Watchlist editor)
342. [x] Permanent delete: confirmation dialog; removes the `stockProfile` row plus any orphan `apiDividendHistory` entries for that ticker. Disabled when any history exists

---

---

# Project Phase 4 — Buy-Sell Planning + UX gap closure (sourced from `scratch_notes/notes 10May2025.md`)

> Build order: tackle the small UX gaps first (32a–32c) so the new planning screen (32d–32h) inherits a solid foundation. Manual stocks (32i) sits last — it touches every market-data read site, so doing it before the planning screen would force the planning screen to thread the manual-stock check through every yield calc that hasn't been written yet.
>
> The user reported these requirements after testing the app on 2026-05-10. Most are tightenings of existing behaviour (validation, layout, regression on dividend cash); the new screen (SPEC-034) is the one large addition.

## Phase 32 — Buy-Sell Planning + UX gap closure

**Sub-phase 32a — Dividend cash-landing regression fix + auto-fill share count ✓ DONE** *(items 365 + 365a complete; `getOpenLots(accountId, ticker, asOfDate)` now accepts an as-of date; DividendForm auto-fills shares from lots held on `exDividendDate − 1` with an inline hint and "No shares held" warning chip; cash-landing investigation confirmed the data path is intact end-to-end — the original report was a stuck filter selection in `HybridFilterDropdown`)*

**Sub-phase 32b — Dividend list single-line layout (extends SPEC-021)**
366. [ ] Reformat the unified dividend list rows on the Stock page so all data renders **on one line** — no wraps, no sublines. Columns: `Ex-div | Pay | Per share | Shares | Tax % | Net | Type | Source | Account | (actions)`. Headers use compact short labels with a tooltip on each describing the full meaning. The `Special` indicator becomes a column value (chip rendered inside the `Type` column) instead of an inline element next to `Per share`. When the currency-toggle is set to Main, an extra "Net (main)" column becomes visible. Non-essential columns are hide-able via the standard `ConfigurableTable` column-picker; `Ex-div`, `Pay`, `Per share`, `Net`, and `(actions)` are always visible

**Sub-phase 32c — Sell form lot-picker validation + two-way binding (extends SPEC-019)**
367. [ ] Per-lot share-input field is constrained to the lot's remaining shares. Higher input is clamped at input time; field's `max` attribute is set; small "max N" hint renders next to the field
368. [ ] Two-way binding between the top-level "Shares" field and the per-lot quantities. When the user edits any per-lot quantity, the top-level "Shares" auto-updates to the sum of all lot quantities. The reverse (top-level → FIFO re-allocation across lots) remains the default starting behaviour; "auto-fill from lots" wins once the user has touched any lot quantity

**Sub-phase 32d — Action-modal z-index above ConfigurableTable fullscreen overlay (extends SPEC-018)**
369. [ ] When the Positions table is in fullscreen mode and the user clicks a row action (Sell / Dividend / row detail), the action's modal renders **above** the fullscreen overlay so the user can interact with it. Apply via document-body portal for action modals (or strict z-index above `fullscreenOverlay`). Same fix lives in any future use of `ConfigurableTable` (Reports table tab in Phase 29d)

**Sub-phase 32e — Manual stocks: custom assets with user-entered prices (extends SPEC-029)**
370. [ ] Extend `stockProfiles` with `isManual: bool` (default `false`) and `manualPriceSource: 'user' | null`. New `manualPrices` collection keyed by `(ticker, date)`
370a. [ ] "Add manual stock" entry point on Stock inventory (SPEC-033 Phase 30); creates `{ ticker, name, stockExchange (free-text, default `MANUAL`), currency, hqCountryOverride, isManual: true, manualPriceSource: 'user', resolvedSource: 'manual' }`
370b. [ ] Stock page header: `[Set price]` button replaces the live-price line when `isManual === true`; opens a small form to enter `(price, date)`; latest manual price is shown wherever live prices are normally read. Manual-price history accessible from the same place
370c. [ ] Provider-chain short-circuit: introduce `getQuoteForProfile(profile)` helper that gates every `getLatestPrice` / `getHistoricalSeries` / `getDividends` call. When `profile.isManual === true`, returns user-entered prices and user `dividends` only — no provider call. All consumers (Stock page, Investments overview, Reports, Buy-Sell Planning) route through this helper. "Manual stock" badge rendered on Stock page + Buy/Sell/Dividend forms
370d. [ ] Storage tab: `manualPrices` registered as a per-stock-breakdown card

**Sub-phase 32f — Trading fees configuration (foundation for SPEC-034)**
371. [ ] Settings → Investments tab: new "Trading fees" card. Per stock-exchange defaults: `{ mic, currency, feePercent, minimumFee }`. Per-stock overrides: `{ ticker, feePercent, minimumFee, currency }`. Adding an exchange offers the canonical-MIC list from `marketDataExchanges.js`
372. [ ] Resolution helper `resolveTradingFee(ticker, exchange, gross)` exported from `data/settings.js`: returns `{ feeAmount, source: 'stock' | 'exchange' | 'none' }`. Computed as `max(minimumFee, gross × feePercent)`. Used by SPEC-034 row-creation defaults and (optionally, future enhancement) by the existing Buy/Sell forms as the fee-field default

### SPEC-034 Buy-Sell Planning — implementation
> All acceptance criteria below are tracked through Sub-phases 32g and 32h of Phase 32.

**Sub-phase 32g — Buy-Sell Planning screen scaffold**
373. [ ] Add **Buy-Sell Planning** to the Investments nav second-row tab list (alongside `Investments overview / Portfolios / Watchlists / Benchmarks / Dividends`); create page route + screen file; empty-state "No scenarios yet — Create one to start planning"
374. [ ] `tradingScenarios` collection in localStorage; CRUD: create, rename, duplicate, delete; auto-save on every edit; scenario picker dropdown in page header showing the active scenario name
375. [ ] Scenario stores: `{ name, sellRows, buyRows, cashTopUps, fxOverrides, displayedCurrencies, removeExecutedRows }` per the SPEC-034 Data block; row-add / row-remove operations work but compute calculations come in 32h
375a. [ ] Add-row controls: row-add for buys opens a stock-picker modal (existing or SPEC-029-resolved tickers); row-add for sells opens a position-picker scoped to currently-held positions across all investing accounts
375b. [ ] Sell row defaults: investing-account picker shows only accounts that hold the stock; defaults to the largest position when multiple accounts qualify
375c. [ ] Buy row defaults: investing-account picker offers all investing accounts; defaults to the most-recently-used account
375d. [ ] Sell row Number-of-shares input is constrained to ≤ available shares on the picked account (matches the SPEC-019 per-lot bound from item 367 applied here at row level)

**Sub-phase 32h — Buy-Sell Planning calculations + execution + storage card**
376. [ ] Sell rows + Buy rows render via the shared `ConfigurableTable` with the column sets defined in SPEC-034. Always-visible columns are non-removable; toggleable columns persist visibility per-table in localStorage
376a. [ ] Sell-table column set: ticker, account, shares-to-sell, available-shares (with `(N LT)` subline), name, exchange, currency, FX-rate-vs-main, last price, adjusted price, fee amount, fee %, last actual dividend % / per-month gross / per-month net, last year dividend % / per-month gross / per-month net, trade value gross / net-of-fee / main-currency, lot-picker action — visibility per the SPEC-034 always-visible / toggleable split
376b. [ ] Buy-table column set: ticker, account, shares-to-buy, name, exchange, currency, FX-rate-vs-main, last price, adjusted price, fee amount, fee %, last actual dividend % / per-month gross / per-month net, last year dividend % / per-month gross / per-month net, buy price including fee per share, trade value without fee / with fee / main-currency-with-fee — visibility per the SPEC-034 always-visible / toggleable split
377. [ ] Adjusted-price control per row: `Last price` / `Round down to N decimals` / `Round up to N decimals` / `Manual`; drives every downstream row calculation. Decimal-count input shown when round rule selected
378. [ ] Fee handling per row: pre-fills from `resolveTradingFee()` (Sub-phase 32f); inline override per row sets `manualFeeOverride` on the row; small dot indicator marks overridden rows; tooltip on Fee column header points to Settings → Investments → Trading fees
378a. [ ] Dividend % columns use the per-row `(adjustedPrice + fee/share)` as the **denominator** so the fee impact appears in the planned-trade yield (numerator reuses Phase 28b TTM and forward computations); per-month gross = numerator × shares ÷ 12; per-month net = gross × (1 − resolved tax %)
379. [ ] Overview block: cash balances panel (per-currency totals across all investing accounts), per-currency planning-only top-up inputs, FX-rates panel (live default + user override), cash-impact table (Start | Sells | Buys | End per displayed currency), weighted-average dividend metrics row (sells / buys / delta in gross + net)
379a. [ ] Currency-display picker in overview: user ticks which currencies the summary totals are expressed in; defaults to all trade currencies of included rows + main currency
379b. [ ] FX rates panel auto-populates the pairs the calculation actually uses (e.g. trade-currency → main-currency for every distinct trade currency); pre-fills with live SPEC-027 rates; user can override; overrides apply only to this scenario's calc
380. [ ] Currency-exchange priority for cash-impact: matching trade currency → main currency → other balances by descending available value. Implemented in a pure helper `simulateCashImpact(scenario, balances, fxRates)` so it is testable in isolation
381. [ ] Sell row "Available shares" displays `(N held > 365 days)` long-term-hold count from `getOpenLots(..., asOfDate=today)` filtered by buy-date age. Header tooltip explains the count is informational
382. [ ] Sell row lot-picker action button reuses the existing real Sell form's lot-picker UI (FIFO default; respects the LT hint by showing lot ages)
383. [ ] **Execute** action button per row opens the matching real `BuyForm` / `SellForm` pre-filled (account, ticker, shares, adjusted price, fee, lot allocations). On successful save: row gets `executedAt`, `executedTransactionId`; row visually muted; Include checkbox forcibly off. Cancel leaves the row untouched
384. [ ] Per-scenario "Remove executed rows on save" toggle in scenario actions menu (default off — keep history)
385. [ ] Settings → Storage tab: add "Buy-Sell Planning" card listing scenario count, total bytes, per-scenario breakdown, bulk-clear action

**Sub-phase 32i — Generic edit/delete control discoverability audit (cross-spec)**
386. [ ] User reported on 2026-05-14 that they could not find edit/delete controls on several record types (investment-side transactions, dividends, investing accounts, budgeting accounts/transactions). The controls exist (per Phase 26c, SPEC-002, SPEC-005, SPEC-006, EditDividendDialog) — this item is a UX audit pass, not new functionality. Walk every list view, ensure: edit (`✎`) and delete (`🗑`) buttons are visible without hovering on touch devices, accessible-label is set, and the button is in the row's main visual block (not an off-screen kebab menu). Document any control that is keyboard- or screen-reader-only and add a visible icon counterpart. No spec changes — this is an implementation-time pass

**Sub-phase 32j — Ticker remap, confirmation review, CSV-import nudge ✓ DONE** *(items 387–391 complete in commit `0d7eaf8` — TickerRenameDialog gained a mandatory rename-vs-remap mode picker; `renameTicker` cascades `apiDividendHistory` in `'rename'` mode and drops it in `'remap'` mode; Stock inventory gained `confirmed`/`confirmedAt` columns, a Price column, an All/Confirmed/Unconfirmed filter pill, and a deep-link entry point; CSV-import commit now stubs `stockProfile` rows for every imported ticker and the Done screen surfaces a "Review in Stock inventory" card pointing at the Unconfirmed filter; `refreshApiDividendHistory` drops API rows whose currency mismatches the stock profile to neutralise the GOLD-style cross-listing leak)*
