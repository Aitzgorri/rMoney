# Implementation Plan

> Remaining feature work, ordered by recommended implementation sequence.
> When an item is fully implemented, **remove it** from this file.
> Items are grouped by spec but ordered by cross-spec dependencies and shared-code opportunities.

**Current phase: Phase 18 — CSV import (complete); Phase 17 Investment Reports complete** *(All MVP feature phases complete: 3, 4b, 5b, 5c, 6, 6b, 7; Phases 8–18 and 22–24 complete)*

**Post-MVP — Project Phase 2 enhancements:** Phases 8–21 below cover the Phase 2 work from `project goal.md` (desktop layout, data portability, app-wide currency conversion, and the full Investments module). Start these after Phase 7.

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

**Key takeaway:** SPEC-002, SPEC-003, and SPEC-004 are pure data producers — everything downstream depends on them. SPEC-005 is both a producer and consumer. SPEC-009 is envelope-only (no account link) and writes to SPEC-004. SPEC-013 bridges planned items to real account transactions (SPEC-005).

**Phase 2 key takeaway:** SPEC-017 Currency conversion and SPEC-027 Market data are the two foundational utilities that almost every Investments spec depends on — build them first. **SPEC-018 (investing accounts + cash balances + cash movements) is the single bridge between the Investments module and budgeting**: only deposits and withdrawals create linked SPEC-005 transactions; buy/sell/dividend no longer write to SPEC-005 directly. This means the user's flow is "deposit cash into the investing account → use that cash to buy/sell → withdraw cash back to budgeting when wanted," and every intermediate stock transaction is internal to Investments. SPEC-016 Data portability reads and writes *everything* (including `cashBalances` and `cashMovements`) — it should be implemented last in Phase 2 so it covers all the new data shapes.

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

> **Phase 10 complete.** All budgeting screens (Dashboard, Transactions, Envelopes, Budgets, Planning) show main-currency totals. Historical-rate snapshotting is deferred to Phase 12 (investment transactions need it).

146. [ ] Historical-rate snapshotting on investment transactions (consumed by Phase 12)

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
157d. [x] **Yahoo Finance adapter** — implements `getLatestPrice`, `getHistoricalSeries`, `getDividends`, `getCorporateActions`, `getStockProfile`, `getForex`, `getHistoricalForex`, `getIndexSeries`. Uses `query1.finance.yahoo.com/v8/finance/chart/{ticker}{suffix}` for prices; chart `events=div,split` for dividends + splits. Suffix derived via `resolveExchange` (`.L`, `.DE`, `.PA`, `.AS`, `.MI`, `.MC`, `.ST`, `.HE`, etc.). News endpoint throws "not supported" (Yahoo's news endpoint is unstable).
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
160. [ ] Snapshot exchange rates at transaction date — deferred to Phase 10 historical-rate work
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
