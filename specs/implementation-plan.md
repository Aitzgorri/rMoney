# Implementation Plan

> Remaining feature work, ordered by recommended implementation sequence.
> When an item is fully implemented, **remove it** from this file.
> Items are grouped by spec but ordered by cross-spec dependencies and shared-code opportunities.

**Current phase: Phase 33 ready, split into v0.33.0 and v0.34.0.** MVP, Phase 2 (8–24), Phase 3 (25–31), and Phase 4 (32) are substantially complete. Phase 33 is split into two releases: **v0.33.0** ships foundation utilities + bug fixes + the Android build pipeline (Sub-phase 21a pulled forward), and **v0.34.0** ships the dividend-status model and all its consumers. Mobile Investments parity (21b) and future asset classes (Phase 20, sketched in SPEC-035) remain post-Phase-33.

---

## Phase summary

| Phase | Status | Notes |
|---|---|---|
| 1 — MVP core data entry | ✓ done | |
| 7 — Desktop deployment (Tauri) | ✓ done | Mobile + auto-update deferred |
| 8 — Desktop UI enhancements | mostly done | Item 131 (Stock page desktop layout) deferred to Phase 14 |
| 9 — Data portability | ✓ done | |
| 10 — App-wide currency conversion | ✓ done | |
| 11 — Investments foundation (accounts + market data) | mostly done | Pending items below |
| 12 — Stock transactions | mostly done | Pending items below |
| 13 — Dividends MVP | partial | Per-country tax deferred (needs SPEC-027 item 157) |
| 14 — Stock page | mostly done | Stock-exchange selector + projections deferred |
| 15 — Portfolios | ✓ done | |
| 16 — Benchmarks | ✓ done | |
| 17 — Investment reports | ✓ done | |
| 18 — CSV import | ✓ done | |
| 19 — AI integration | ✓ done | |
| 20 — Future asset classes | placeholders | See SPEC-035 roadmap |
| **21a — Android build pipeline** | **scheduled with v0.33.0 / v0.34.0** | Closes the "single-file install on mobile" goal |
| 21b — Mobile Investments parity | deferred (after 21a) | Six SPEC-028 items |
| 22 — Stock profile resolution | ✓ done | |
| 23 — Watchlists & alerts | ✓ done | |
| 24 — Security & secrets handling | mostly done | 3 deferred items below |
| 25 — Investment data foundation | ✓ done | |
| 26 — Stock lifecycle UX + transaction edits | mostly done | 4 deferred items below |
| 27 — Investing account detail overhaul | ✓ done | |
| 28 — Stock page enhancements | ✓ done | |
| 30 — Stock inventory page (NEW SPEC-033) | ✓ done | |
| 31 — Dividend page (NEW SPEC-032) | ✓ done | |
| 32 — Buy-Sell planning + UX gap closure (NEW SPEC-034) | ✓ done | Item 382 (standalone lot-picker button) deferred polish |
| **33 — Foundation + bug fixes + Android pipeline (v0.33.0)** | **active** | 33a–d, 33i, 33k, 33m, 21a — see breakdown below |
| **33 — Dividend overhaul (v0.34.0)** | **planned** | 33e, 33f, 33g, 33h, 33j, 33l — depends on v0.33.0 foundation |

---

## Shared code — utilities pending extraction

> All other shared utilities (currency conversion cache, market data client, inline form expansion, AI connection, `cashMovements` ledger, HybridFilterDropdown, CurrencyToggle, ConfigurableTable, soft-delete lifecycle, XIRR, persisted-history-vs-hot-cache split, drag-and-drop tree, planning-period calculation, frequency math, one-time/regular toggle) are extracted as shared modules. See `app/src/components/` and `app/src/utils/` for paths. Two remain inline:

| Utility | Status | Location | Notes |
|---|---|---|---|
| Hierarchical tree component | inline | Used in Categories + Envelopes screens | Review for SPEC-009 (planned expenses) generalisation if/when that phase resumes |
| Cascade-delete confirmation dialog | inline | Used in Categories + Envelopes | Extract before SPEC-009 needs it |

**Phase 33 introduces one new shared component:** `components/CurrencyDropdown.jsx` (favorites + alphabetical others). See Sub-phase 33a.

---

## Pending items from earlier phases

### SPEC-015 UI Enhancements (Phase 8 leftover)
131. [ ] Stock page (SPEC-021): price chart + metadata in one row, transactions + dividends below — deferred to Phase 14

### SPEC-018 Investing Accounts (Phase 11 leftovers)
152. [ ] Optional reference to default CSV import template on investing account
152c. [ ] Auto-create a cash balance when a buy/sell/dividend needs a currency not yet in the account
152j-full. [ ] Cross-currency deposit full model: land amount in a matching-currency cash balance (auto-created if needed), then bundle an auto-exchange to the destination currency — replaces the current single rate-field approach
152m-full. [ ] Cross-currency withdrawal full model handled symmetrically

### SPEC-027 Market Data Integration (Phase 11 + Phase 24 leftovers)
157f. [ ] **Finnhub adapter** — `getLatestPrice`, `getStockProfile`, `getNews`, `getDividends`, `getForex`. Auth via `?token=`. News is the strongest reason to keep Finnhub in the chain.
157g. [ ] **Stooq adapter** — `getLatestPrice` + `getHistoricalSeries` only. Dividends / news / profile / corporate-actions throw `'not supported'` so the chain falls through.

> *Item 157 (HQ country lookup) has been promoted into Phase 33 — see Sub-phase 33b** below — because the per-country dividend tax (SPEC-020 item 178) and the Reports regional breakdowns both depend on it, and SPEC-029 lastKnownPrice work in 33b touches the same `getStockProfile` code path.*

### SPEC-020 Dividends (Phase 13 leftover) — newly unblocked by Phase 33 promotion of item 157
178. [ ] Per-country tax %; country = HQ country of the stock by default, manually overridable per stock. **Promoted into Phase 33** (see Sub-phase 33e** below) now that the HQ country lookup is part of the same release.

### SPEC-019 Stock Transactions (Phase 12 leftovers)
159b. [ ] Cross-currency source triggers a companion `currency-exchange` record (deferred from Phase 12e — only the standalone exchange path is wired; the buy-triggered path still pends)
164. [ ] Proceeds destination cash balance selector on Sell form — currently always uses the matching-currency balance
165. [ ] Retroactive cost-basis recalculation on buy edits
170. [ ] API-detected splits presented as a pending notification (requires SPEC-027)

### SPEC-021 Stock Page (Phase 14 leftover)
185. [ ] Stock-exchange selector — profile exchange is currently shown as text; per the project goal, clicking through exchanges (showing the same stock on a different exchange) is desired. Today this requires the Re-identify dialog.

### SPEC-031 Security and secrets handling (Phase 24 leftovers)
237a. [ ] Runtime meta-tag CSP injection — meta tags can only restrict, not expand, existing policy; custom AI host support requires Tauri HTTP plugin
241a. [ ] Full Backup mode prompts for the master passphrase before producing the file; embeds the Stronghold vault bytes base64-encoded under `_strongholdVault`
255. [ ] When IBKR retail OAuth ships, tokens go straight to Stronghold under `marketData/ibkr/oauth/{accessToken,refreshToken}`

### SPEC-019 Stock Transactions (Phase 26 leftovers)
286. [ ] Edit form for transfer between investing accounts — `updateTransfer()` data function is implemented; UI edit form deferred
288. [ ] Edit form for currency-exchange triggered-by-buy — completes the deferred triggered-by-buy edit path (item 172e)
291. [ ] Fee-currency invariant: buy and sell forms validate `feeCurrency === tradeCurrency` and block save with an inline error. `legacyFeeMismatch: true` flag tags pre-existing buy/sell records where the invariant didn't hold (UI shows a warning chip)

### SPEC-034 Buy-Sell Planning (Phase 32 leftover)
382. [ ] Standalone sell-row lot-picker button (stores lot selections back to the planned row without executing) — the lot picker IS available inside the Execute modal; this is the standalone polish version

---

## Phase 20 — Future asset classes (placeholder slots)

> Reserved slots in the investment-type filter so the reports UI is complete from day one. Each asset class gets its own spec round later with type-specific fields and lifecycle.
>
> **Roadmap and design questions:** see [SPEC-035 Asset class roadmap](features/SPEC-035-asset-class-roadmap.md). Suggested build order: crypto → bonds → metals storage → metals lease → options. Each graduates to its own full spec (`SPEC-036+`) before implementation begins.

220. [ ] **Options** — strike, expiry, underlying, exercise/assignment lifecycle, greeks tracking — see SPEC-035 § Options
221. [ ] **Bonds** — coupon, yield, maturity, accrued interest, amortization — see SPEC-035 § Bonds
222. [ ] **Crypto** — wallets, network transfers, cost basis (may reuse stock model) — see SPEC-035 § Crypto
223. [ ] **Precious metals (storage)** — quantity, weight unit, purity, storage cost, no yield — see SPEC-035 § Precious metals — storage
224. [ ] **Precious metals (lease)** — counterparty, lease rate, payout cadence, principal return date — see SPEC-035 § Precious metals — lease

---

## Phase 21 — Mobile (Capacitor)

> The project goal calls for *"user to install everything with one file, both on mobile and computer"* — mobile is co-equal with desktop, not a far-future nice-to-have. Phase 21 is split:
>
> - **21a (Android build pipeline)** — pulled forward to land alongside the Phase 33 release line. Once items 363 + 364 + 364a ship the user can install rMoney on Android via a `.apk`, even if the Investments deep-dive views are still mobile-light.
> - **21b (Investments parity)** — full mobile rewrite of the Investments-side screens. Stays deferred until 21a is shipped and the user has used the Android app long enough to confirm what's actually missing.

### Phase 21a — Android build pipeline (target: v0.33.0 / v0.34.0 release line)
### SPEC-010 Deployment — mobile (Capacitor) prerequisites
363. [ ] `npx cap add android` + `npx cap open android` opens Android Studio with the project ready to build
364. [ ] App data persists locally on the device (localStorage in WebView is automatically persistent; this item is the confirmation pass)
364a. [ ] Production `.apk` build produced by `cd app && npm run build && npx cap sync android && ./gradlew assembleDebug`; output attached to GitHub release alongside the Windows `.msi` per `RELEASE.md` mobile flow
364b. [ ] Re-verify on Android: dev-mode banner, Stronghold fallback (`secrets.js` uses `rmoney_dev_secrets` localStorage path on Capacitor since Tauri-Stronghold doesn't run there), market-data CORS transport (Capacitor allows direct fetch to Yahoo / Stooq without the Tauri HTTP plugin), backup save/load via the `@capacitor/filesystem` plugin

### Phase 21b — Mobile Investments parity (deferred until 21a ships)
### SPEC-028 Mobile Investments Parity
225. [ ] Stock price chart on mobile
226. [ ] Top 5 news on mobile
227. [ ] AI evaluation on mobile
228. [ ] Full Investment reports on mobile
228a. [ ] Watchlists & alerts on mobile (SPEC-030 parity, including the Investments dropdown menu)
228b. [ ] Tauri local notifications for watchlist alerts on mobile (SPEC-030 Phase B — runtime upgrade only, data model unchanged)

---

# Phase 33 — Dividend-flow overhaul + UX polish

> Sourced from `scratch_notes/notes 16May2026.md`. Foundation utilities first (33a–c), then the dividend-status model (33f), then the screen-shaped items that depend on it.

**Key takeaway:** Phase 33 introduces the **dividend-status model** (`'received' / 'pending-payment' / 'pending-confirmation'`), converting the dividend record from "thing that already happened" into a small state machine. Cash impact is deferred until the record reaches `'received'`, which lets future-dated user dividends, API-declared dividends, and past user records share the same pipeline. The other Phase 33 items are non-data-shape extensions: a shared `CurrencyDropdown` everywhere, a persisted `lastKnownPrice` so offline rendering never shows blank cells, per-data-type cache TTLs, a per-page "Reset API" button, a contrast pass, the long-deferred per-country dividend tax, the Capacitor Android build pipeline, and a batch of bug fixes uncovered during 2026-05-16 user testing. **No new specs — every item extends an existing one.**

## Release split

To avoid one large `v0.33.0` slip, Phase 33 is split into two releases:

### v0.33.0 — Foundation + bug fixes + Android pipeline
Ships fixes and infrastructure quickly. Users notice the bug fixes and the small UX upgrades immediately; the Android build pipeline closes the "single-file install on mobile" goal.

- **33a** Shared CurrencyDropdown
- **33b** lastKnownPrice persistence + HQ country verification
- **33c** Configurable cache TTLs + offline fallback + per-page Reset API
- **33d** Re-identify button rename + Stock inventory wider table + Edit profile re-resolve
- **33i** Stock page dividend list bug fixes + delete + lots expand
- **33k** CSV import composite-key dedup + post-commit report
- **33m** Small / muted text contrast pass
- **21a** Android build pipeline (items 363, 364, 364a, 364b)

### v0.34.0 — Dividend overhaul
The bigger conceptual change lands as its own milestone once v0.33.0 is stable.

- **33e** No-dividends flag + paysDividends consumers + per-country tax
- **33f** Dividend status model + cash-deferral + auto-promotion
- **33g** Confirmation flow + Pending tab
- **33h** Multi-account dividend entry + duplicate warning
- **33j** Dividend page calendar / metrics / chart rework
- **33l** Buy-Sell planning enhancements (refresh, disregard cash, overspend, max fee)
- **33n** Backup format v2 + v1 → v2 migration (loaders accept v1 backups)

**Why this split:** every v0.33.0 item is either a foundation utility (consumed but not extended by v0.34.0), an isolated bug fix, or the Android pipeline (which has no dependency on the dividend rework). v0.34.0 is the dividend-status story, end to end. No item changes meaning across the boundary.

## Dependency order within Phase 33 (verified)

1. **33a** (CurrencyDropdown) — independent; wide-touching refactor; do alone to avoid merge churn.
2. **33b** (lastKnownPrice + HQ country verification) — small data-model + provider hook + read-site fallback; consumed by 33d Edit profile re-resolve AND by 33e per-country tax.
3. **33c** (Cache TTL + Offline + Reset API) — settings shape + helper; consumed by 33l Buy-Sell planning refresh button.
4. **33d** (Re-identify button + Stock inventory wider table + Edit profile re-resolve) — depends on 33b.
5. **33e** (paysDividends flag + per-country tax) — depends on 33d Edit profile dialog hosting the field, and on 33b HQ country verification.
6. **33f** (Dividend status model) — foundation for 33g, 33h, 33i, 33j.
7. **33g** (Confirmation flow + Pending tab) — depends on 33f.
8. **33h** (Multi-account dividend entry + duplicate warning) — depends on 33f.
9. **33i** (Stock page dividend list bug fixes + delete + lots expand) — depends on 33f.
10. **33j** (Dividend page calendar + metrics + chart) — depends on 33f.
11. **33k** (CSV dedup + report) — independent; do anytime.
12. **33l** (Buy-Sell planning enhancements) — depends on 33c.
13. **33m** (Contrast pass) — last; touches many CSS modules and could conflict with concurrent UI work.

---

**Sub-phase 33a — Shared CurrencyDropdown** ✓ done

### SPEC-017 Currency Conversion — Phase 33 items
392. [x] New `components/CurrencyDropdown.jsx` — favorites + divider + alphabetical others, reads `settings.favoriteCurrencies` + `utils/iso4217.js`
393. [x] Settings → General → "Favorite currencies" card — drag-reorder, add (searchable picker over ISO 4217), remove (× disabled for main currency), one-shot migration seeding from `SUPPORTED_CURRENCIES`
394. [x] Replace every inline `CURRENCIES = [...]` constant and free-text currency input in the codebase with `CurrencyDropdown`
395. [x] Main-currency auto-add: when the user picks a new main currency, add it to favorites at the top if absent

**Sub-phase 33b — Last-known price persistence on stock profile + HQ country lookup verification**

### SPEC-029 Stock Profile Resolution — Phase 33 items
396. [ ] Extend `stockProfiles` with `lastKnownPrice: { amount, currency, fetchedAt } | null`
397. [ ] First-time resolve writes `lastKnownPrice` from the price the resolution dialog already fetched for the candidate
398. [ ] `marketDataClient.getLatestPrice` updates `lastKnownPrice` on every successful provider fetch (skipped when `isManual === true`)
399. [ ] Re-resolve rewrites identity fields (name, exchange, currency) AND `lastKnownPrice`; other fields preserved
400. [ ] Offline / failed-fetch read sites fall back to `profile.lastKnownPrice` before showing "—"; clock-icon indicator + tooltip with `fetchedAt`

### SPEC-027 Market Data Integration — Phase 33 items (HQ country, promoted from Phase 11)
400a. [ ] **HQ country lookup verification pass.** Audit `getStockProfile` across every adapter; ensure `hqCountry` is returned when the provider exposes it. Today Yahoo + Massive return it; verify TwelveData (`/stocks?symbol=...`) and AlphaVantage (`OVERVIEW` function) populate `Country` and surface it through the adapter. Document any provider that does not in the spec out-of-scope section
400b. [ ] **Refresh profile writes hqCountry.** When the user re-confirms a candidate via Refresh profile or Re-identify ticker, the resolved profile's `hqCountry` is written from whichever adapter returned it (first-non-null wins). Existing manual `hqCountryOverride` on the profile is preserved if set
400c. [ ] **HQ country fallback display.** Wherever a screen reads HQ country (Reports regional / continent breakdowns, Dividend page Metrics tab grouping), the resolution order is `hqCountryOverride → hqCountry → 'Global'`. The Edit profile dialog (SPEC-033) makes both fields inspectable so the user understands which value the app is using

**Sub-phase 33c — Configurable cache TTLs + offline fallback + per-page Reset API**

### SPEC-027 Market Data Integration — Phase 33 items
401. [ ] `settings.apiCacheTtl = { pricesMin, forexMin, newsMin, intradayMin }` with current values as defaults; Settings → Investments → "API call frequency" card with one row per category
402. [ ] Reads consult cache → in-flight dedup → fresh fetch; respect the configured TTL
403. [ ] Offline fallback: when every enabled provider fails, return the most recent cached value regardless of staleness; surface a ⏱ icon + tooltip with cache age
404. [ ] `resetPageCaches(pageId)` helper — pages register their data dependencies (prices / forex / news / intraday / dividend history / profiles)
405. [ ] "Reset API" button at the right end of the page action row on: Investments overview, Stock page, Stock inventory, Dividend page, Investment reports, Buy-Sell planning. Spinner + completion toast
406. [ ] Settings → Storage → "API dividend history" card: per-ticker list capped at 20 rows tall, vertical scroll, sorted alphabetically by ticker

**Sub-phase 33d — Re-identify button rename + Stock inventory wider table**

### SPEC-029 Stock Profile Resolution — Phase 33 button rename
407. [ ] Rename "Rename ticker" button → "Re-identify ticker" in TickerRenameDialog launch point on Stock page header

### SPEC-033 Stock inventory — Phase 33 items
408. [ ] Stock inventory table widens to full container width; ticker column sticky-left when horizontal scroll is needed
409. [ ] Per-row "🔍 Resolve" action button opens TickerRenameDialog with the row's ticker pre-loaded
410. [ ] Edit profile dialog opens the resolution flow first (candidates pre-loaded); "Switch to manual fields" fallback button collapses to free-form fields; HQ country / dividend frequency / estimation rule / tax % override / paysDividends remain editable in a "Settings" section of the same dialog

**Sub-phase 33e — No-dividends flag + paysDividends consumers + per-country tax**

### SPEC-020 Dividends — Phase 33 no-dividends flag
411. [ ] `stockProfiles.paysDividends: bool | null` with default null = unknown/treated as paying
412. [ ] Editable from Edit profile dialog (both Stock page and Stock inventory entry points); Stock inventory shows ⊘ icon in dividend-frequency column when false
413. [ ] Consumers honour the flag: Dividend page calendar + metrics + chart exclude the stock; Stock page hides Refresh dividends button, shows "—" + tooltip on TTM / Fwd / Div-return tiles, excludes from forward-yield calc; "Add dividend" account-picker omits the company
413a. [ ] **paysDividends escape hatch.** When the user clicks `+ Dividend` on a flagged ticker, render an inline "clear flag and continue?" correction prompt instead of silently omitting the ticker (see SPEC-020 § No-dividends flag)

### SPEC-020 Dividends — Phase 33 per-country tax (formerly item 178; unblocked by HQ country work in 33b)
413b. [ ] Settings → Investments → "Per-country dividend tax" card lists country → tax % rows. Add / edit / remove with inline rows. Country picker shows ISO countries. Stored on `settings.dividends.perCountryTaxPercent: { [country]: number }` (the field already exists in the SPEC-020 settings shape)
413c. [ ] Resolution order at dividend creation becomes: **payout input → stock profile override → per-country (using `hqCountryOverride ?? hqCountry`) → global default**. The country level slots between stock and global per the SPEC-020 hierarchy
413d. [ ] Existing dividend records keep their snapshotted `taxPercent` (history is never rewritten). Only newly-created dividends consult the country level

**Sub-phase 33f — Dividend status model + cash-deferral + auto-promotion**

### SPEC-020 Dividends — Phase 33 status model
414. [ ] `dividends.status: 'received' | 'pending-payment' | 'pending-confirmation'`; `source: 'user' | 'api-auto'`; `confirmedAt: ISO | null`; `cashMovementId` becomes nullable
415. [ ] `createDividend` sets status based on: payoutDate vs today + `settings.dividends.confirmReceipt` toggle. No cashMovement written for non-`'received'` states
416. [ ] Auto-promote pending-payment → received (or pending-confirmation when toggle ON) on app boot and after relevant data mutations; auto-write cashMovement on promotion
417. [ ] Auto-recalculate share count from lots for pending-payment records with `exDividendDate > today`; once `exDate ≤ today` lock the share count
418. [ ] Pending-payment record with shares = 0 is dropped on promotion (toast notification)

**Sub-phase 33g — Confirmation flow + Pending tab**

### SPEC-020 Dividends — Phase 33 confirmation flow
419. [ ] `settings.dividends.confirmReceipt: bool` (default false) — Settings → Investments toggle
420. [ ] When toggle ON: auto-create pending-confirmation `dividends` records from `apiDividendHistory` rows reaching payDate ≤ today on tickers with held shares on `exDate − 1`; one per account; `source: 'api-auto'`; auto-filled share count + tax %

### SPEC-032 Dividend page — Phase 33 Pending tab
421. [ ] Dividend page new "Pending" tab — list of pending-confirmation rows with [Confirm] / [Edit] / [Skip] actions per row + "Confirm all" bulk button; count badge on the tab
422. [ ] Top-nav badge next to Investments dropdown shows pending-confirmation count; click → Dividend page Pending tab

**Sub-phase 33h — Multi-account dividend entry + duplicate warning**

### SPEC-020 Dividends — Phase 33 multi-account + duplicate warning
423. [ ] Stock-scoped "Add dividend" form (entry from Stock page + Dividend button, Dividend page Add dividend): identity fields once + per-account row table with auto-filled share counts + Include checkboxes
424. [ ] Account-scoped entry (from InvestingAccountDetail) preserves single-account form behaviour
425. [ ] Duplicate-warning check on save: existing `dividends` (any status) or `apiDividendHistory` row for same `(ticker, exDividendDate)` OR `(ticker, payoutDate)` triggers the warning dialog with [Same dividend] (option to update existing) / [Different dividend (add anyway)] choices

**Sub-phase 33i — Stock page dividend list bug fixes + delete + lots expand**

### SPEC-021 Stock Page — Phase 33 items
426. [ ] Net column rendered for declared / manual / API rows using current shares (or shares on exDate − 1 once past) and resolved tax %
427. [ ] Source column width constrained + ellipsis; action column reserved width; Edit / Delete / Declare buttons stay inside the row at desktop widths
428. [ ] 🗑 Delete button on every user dividend row; confirmation prompt summarising per-share × shares × tax; also deletes linked cashMovement when status === 'received'
429. [ ] Today-date dividend appears only in the past half (≤ today); future-payout date columns corrected (Ex-div from exDate, Pay from payDate)
430. [ ] Future-dated user dividend leak fix: row never appears twice across past/future halves; classification is by payoutDate consistently
431. [ ] Tax % input added to ConvertToDeclaredDialog and standalone Declare dialog; `apiDividendHistory` rows gain optional `taxPercent` field
432. [ ] Positions section rows are expandable; expand reveals per-lot table (Buy date / Days remaining vs 366d / Shares / Price w/o fee / Fee per share / Cost w/ fee / Total w/ fee); weighted-avg summary row at the bottom

**Sub-phase 33j — Dividend page calendar actions + metrics rewrite + chart enhancements**

### SPEC-032 Dividend page — Phase 33 calendar / metrics / chart
433. [ ] Calendar table: ticker column clickable to Stock page; ✎ Edit + 🗑 Delete per row backed by user `dividends` record
434. [ ] Metrics table: company cell clickable when grouped by company
435. [ ] Last 12-months amount metric reworked: sum of user `dividends.netTotal` (status `'received'`, payoutDate in `[today − 1y, today]`); excludes pending records and uses per-record stored shareCount (which reflects holdings on ex-div date)
436. [ ] Next 12-months amount metric reworked: declared rows with exDate ≤ today use `getOpenLots(asOfDate = exDate − 1)`; declared rows with exDate > today use current open lots; estimated rows use current open lots; held set expanded to include tickers with pending receivables even if current open lots = 0
437. [ ] Payout chart: per-bar tooltip with Paid / To be paid breakdown (past = paid only, future = to-be-paid only, current bucket = both); respects gross / net toggle
438. [ ] Payout chart "Grouped by period" toggle: one cluster per quarter / month / week label, one bar per year inside each cluster; dashed-fill for "to be paid" portion preserved; disabled for year bucket

**Sub-phase 33k — CSV import composite-key dedup + post-commit report**

### SPEC-025 Investment CSV Import — Phase 33 items
439. [ ] Transaction dedup by external ID when present, else composite `(date, ticker, shares, price, type)`
440. [ ] Dividend dedup by composite `(payoutDate, ticker, shareCount, dividendPerShare, currency)`
441. [ ] Done-screen report: one row per parsed CSV line with status + reason; filter pill `All / Imported only / Not imported only / Errors only`; per-row "Edit row" (for errors, re-commit) / "View existing record" (for duplicates)

**Sub-phase 33l — Buy-Sell planning refresh + disregard cash + overspend + max fee**

### SPEC-034 Buy-Sell Planning — Phase 33 items
442. [ ] Page-header "Refresh data" button (Phase 33c reset-API integration point for this page)
443. [ ] "Disregard cash balance" toggle in Overview block; cash-impact table Start column = 0 per currency; cash-balances panel muted; `scenario.ignoreActualBalances` persisted per scenario
444. [ ] Cash-impact table new "Overspend" column right of End; per-currency shortfall (absolute value); red tint when > 0; "—" when 0
445. [ ] Cash-impact and dividend-impact table alignment fix: header align matches column data align; currency code in its own narrow right-aligned column; Start always shows a value (0.00 when literal zero, never blank)
446. [ ] Trading fees: optional `maximumFee` field per exchange and per stock; Settings UI gains "Max fee" input next to "Min fee"; validation `max >= min` when both set; `resolveTradingFee` becomes `clamp(gross × feePercent / 100, minFee, maxFee ?? Infinity)`

**Sub-phase 33m — Small / muted text contrast pass**

### SPEC-015 UI Enhancements — Phase 33 contrast pass
447. [ ] Define `--text-muted` and `--text-faint` CSS custom properties in `app/src/styles/tokens.css` (new file); pick values that meet WCAG AA on the existing dark background
448. [ ] Replace every hard-coded grey colour used in small text across all CSS modules with one of the two tokens
449. [ ] Raise any sub-12 px text to ≥ 12 px
450. [ ] Spot-check pass at 100 % and 125 % zoom on every screen

**Sub-phase 33n — Backup format versioning + v1 → v2 migration** *(lands with v0.34.0 since it depends on the dividend status model)*

### SPEC-016 Data Portability — Phase 33 items
451. [ ] Bump the exported `version` string to `rmoney-data-v2` and document the v1 → v2 deltas in the SPEC-016 "Backup format versioning + migration" block
452. [ ] Loader detects `version` field and runs the same boot-time migrations on the imported payload (status stamping, default `favoriteCurrencies` / `apiCacheTtl` / `maximumFee` / `paysDividends` / `lastKnownPrice`) before writing to localStorage in v2 shape
453. [ ] v2 backups loaded into v0.32.0 or older builds are rejected with "This backup was saved by a newer version of rMoney (v0.33.0+). Update the app to load it." Reject unknown future versions the same way
454. [ ] Round-trip test pass: export v0.32.0 backup → load into v0.34.0 build → verify no data loss and that every Phase 33 field is populated with its default value

---

# Release strategy

GitHub releases are tracked separately in [`RELEASE.md`](../RELEASE.md). Summary:

- **Versioning:** SemVer 0.X.Y, marked "Pre-release" on GitHub until the project is feature-complete enough for 1.0.
- **Cadence:** one tag per completed phase milestone (e.g. `v0.32.0` for the Phase 32 milestone, `v0.33.0` for the Phase 33 milestone). Patch tags (`v0.X.1`, `v0.X.2`) for bug-fix-only releases between phases.
- **Platforms today:** Windows desktop only (Tauri `.msi` + NSIS `.exe`). Linux/macOS desktop and Android mobile added when their build pipelines come online.
- **Process today:** fully manual local build + manual `gh release create`. GitHub Actions is documented as the next-step migration path in `RELEASE.md`.
- **Mobile:** gets its own release line via Capacitor (`.apk`) once Phase 21 ships.
