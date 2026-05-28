# Implementation Plan

> Remaining feature work, ordered by recommended implementation sequence.
> When an item is fully implemented, **remove it** from this file.
> Items are grouped by spec but ordered by cross-spec dependencies and shared-code opportunities.

**Current phase: Phase 33 shipped as v0.34.0 (2026-05-28).** MVP, Phase 2 (8–24), Phase 3 (25–31), and Phase 4 (32) are substantially complete. Phase 33 is fully done — the planned v0.33.0 / v0.34.0 split was collapsed into a single v0.34.0 release because no installer was published between them; the v0.34.0 build bundles every Phase 33 sub-phase, Phase 21a (Android pipeline), and a hotfix wave for production-build regressions (see the 21a/33n fix block below). Mobile Investments parity (21b) and future asset classes (Phase 20, sketched in SPEC-035) remain.

---

## Phase summary

| Phase | Status | Notes |
|---|---|---|
| 1 — MVP core data entry | ✓ done | |
| 7 — Desktop deployment (Tauri) | ✓ done | Mobile + auto-update deferred |
| 8 — Desktop UI enhancements | ✓ done | |
| 9 — Data portability | ✓ done | |
| 10 — App-wide currency conversion | ✓ done | |
| 11 — Investments foundation (accounts + market data) | mostly done | Pending items below |
| 12 — Stock transactions | mostly done | Pending items below |
| 13 — Dividends MVP | partial | Per-country tax now scheduled in Sub-phase 33e (v0.34.0) |
| 14 — Stock page | mostly done | Stock-exchange selector deferred (item 185) |
| 15 — Portfolios | ✓ done | |
| 16 — Benchmarks | ✓ done | |
| 17 — Investment reports | ✓ done | |
| 18 — CSV import | ✓ done | |
| 19 — AI integration | ✓ done | |
| 20 — Future asset classes | placeholders | See SPEC-035 roadmap |
| **21a — Android build pipeline** | ✓ done | Verified on device 2026-05-28 |
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
| **33 — Foundation + bug fixes + Android pipeline** | ✓ shipped in v0.34.0 | 33a–d, 33i, 33k, 33m, 33o, 21a |
| **33 — Dividend overhaul** | ✓ shipped in v0.34.0 | 33e, 33f, 33g, 33h, 33j, 33l, 33n (incl. SPEC-031 § 241a) |
| **33 — Production-build hotfix** | ✓ shipped in v0.34.0 | Plugin bundling, http:default, URL Pattern, fs:scope — see SPEC-010 |

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

> **Cleanup pass 2026-05-27:** items 131 (Stock page layout), 152c (auto-create cash balance), and 442 (Buy-Sell Reset button) were verified shipped and removed. Item 178 (per-country tax) is no longer duplicated here — it lives in Sub-phase 33e as items 413b–d.

### Recommended order (logical / technical dependencies)

Tiered so the next pass can pick from the top without re-deriving the chain. Items keep their original numbers + spec grouping below so `plan:validate` stays in sync.

1. **Tier 1 — Adapters** (157f Finnhub, 157g Stooq). Independent of each other. Unblocks Tier 4 splits notification + Tier 5 IBKR OAuth.
2. **Tier 2 — Cross-currency model overhaul** (152j-full, 152m-full, 159b, 164, 288). One cohesive block; all replace the single `exchangeRate` field with the "bundle a companion currency-exchange" model. Splitting them risks two half-models living in parallel.
3. **Tier 3 — Transaction-edit correctness + safety** (291 fee-currency invariant, 165 retroactive cost-basis, 286 transfer edit form). Independent small items.
4. **Tier 4 — Splits + exchange UX** (170 API-detected splits — needs Tier 1; 185 stock-exchange selector).
5. **Tier 5 — Security follow-ups** (237a runtime CSP — needs Tauri HTTP plugin; 255 IBKR OAuth — needs IBKR adapter). *(241a shipped with Sub-phase 33n.)*
6. **Tier 6 — Small UX polish** (152 default CSV template reference, 382 standalone lot-picker button).

### SPEC-018 Investing Accounts (Phase 11 leftovers)
152. [ ] Optional reference to default CSV import template on investing account — `defaultCsvTemplateId` field exists on the account model; only the UI selector is missing.
152j-full. [ ] Cross-currency deposit full model: land amount in a matching-currency cash balance (auto-created if needed), then bundle an auto-exchange to the destination currency — replaces the current single rate-field approach.
152m-full. [ ] Cross-currency withdrawal full model handled symmetrically.

### SPEC-019 Stock Transactions (Phase 12 + Phase 26 leftovers)
159b. [ ] Cross-currency source on buy triggers a companion `currency-exchange` record (deferred from Phase 12e — `triggeredByStockTransactionId` field exists but is never populated).
164. [ ] Proceeds destination cash balance selector on Sell form — currently always uses the matching-currency balance.
165. [ ] Retroactive cost-basis recalculation on buy edits — `updateBuy()` currently rewrites fields without recomputing lots.
170. [ ] API-detected splits presented as a pending notification (requires at least one adapter that surfaces corporate actions — Tier 1).
286. [ ] Edit form for transfer between investing accounts — `updateTransfer()` data function is implemented; UI edit form deferred.
288. [ ] Edit form for currency-exchange triggered-by-buy — completes the deferred triggered-by-buy edit path (item 172e); relies on 159b being wired first.
291. [ ] Fee-currency invariant: buy and sell forms validate `feeCurrency === tradeCurrency` and block save with an inline error. `legacyFeeMismatch: true` flag tags pre-existing buy/sell records where the invariant didn't hold (UI shows a warning chip).

### SPEC-021 Stock Page (Phase 14 leftover)
185. [ ] Stock-exchange selector — profile exchange is currently shown as text; clicking through exchanges (same stock on a different exchange) is desired. Today this requires the Re-identify dialog.

### SPEC-027 Market Data Integration (Phase 11 + Phase 24 leftovers)
157f. [ ] **Finnhub adapter** — `getLatestPrice`, `getStockProfile`, `getNews`, `getDividends`, `getForex`. Auth via `?token=`. News is the strongest reason to keep Finnhub in the chain.
157g. [ ] **Stooq adapter** — `getLatestPrice` + `getHistoricalSeries` only. Dividends / news / profile / corporate-actions throw `'not supported'` so the chain falls through.

### SPEC-031 Security and secrets handling (Phase 24 leftovers)
237a. [ ] Runtime meta-tag CSP injection — meta tags can only restrict, not expand, existing policy; custom AI host support requires Tauri HTTP plugin.
~~241a.~~ ✓ shipped in Sub-phase 33n — see the 33n block below.
255. [ ] When IBKR retail OAuth ships, tokens go straight to Stronghold under `marketData/ibkr/oauth/{accessToken,refreshToken}` — gated on the IBKR adapter actually being built (currently a stub).

### SPEC-034 Buy-Sell Planning (Phase 32 leftover)
382. [ ] Standalone sell-row lot-picker button (stores lot selections back to the planned row without executing) — the lot picker IS available inside the Execute modal; this is the standalone polish version.

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

### Phase 21a — Android build pipeline ✓ done (verified on device 2026-05-28)
### SPEC-010 Deployment — mobile (Capacitor) prerequisites
363. [x] `npx cap add android` + `npx cap open android` opens Android Studio with the project ready to build
364. [x] App data persists locally on the device (localStorage in WebView is automatically persistent; confirmed on device)
364a. [x] Production `.apk` built via `npm run android:sync` then `.\gradlew.bat assembleDebug` in `android/`; attached to GitHub release per RELEASE.md
364b. [x] Re-verify on Android: dev-mode banner shows; market-data CORS works (CapacitorHttp); backup save writes to Documents dir (or Web Share destination); backup load via file picker works

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

## Shipped as v0.34.0 (2026-05-28)

Phase 33 was originally planned as a two-tag release (v0.33.0 foundation, v0.34.0 dividend overhaul), but no installer was published between the two milestones, so both collapsed into a single first GitHub release.

**v0.34.0 bundles:**

| Sub-phase | What shipped |
|---|---|
| 33a | Shared CurrencyDropdown |
| 33b | lastKnownPrice persistence + HQ country verification |
| 33c | Configurable cache TTLs + offline fallback + per-page Reset API |
| 33d | Re-identify button rename + Stock inventory wider table + Edit profile re-resolve |
| 33e | No-dividends flag + paysDividends consumers + per-country tax |
| 33f | Dividend status model + cash-deferral + auto-promotion |
| 33g | Confirmation flow + Pending tab |
| 33h | Multi-account dividend entry + duplicate warning |
| 33i | Stock page dividend list bug fixes + delete + lots expand |
| 33j | Dividend page calendar / metrics / chart rework |
| 33k | CSV import composite-key dedup + post-commit report |
| 33l | Buy-Sell planning enhancements (refresh, disregard cash, overspend, max fee) |
| 33m | Small / muted text contrast pass |
| 33n | Backup format v2 + v1 → v2 migration + Stronghold vault embed (SPEC-031 § 241a) |
| 33o | Negative cache for failed fetches |
| 21a | Android build pipeline + on-device verification |
| 21a/33n fix | Production-build hotfix: plugin bundling, http:default, URL Pattern, fs:scope (see SPEC-010 § Tauri production-build pitfalls) |

---

**Sub-phase 33a — Shared CurrencyDropdown** ✓ done

### SPEC-017 Currency Conversion — Phase 33 items
392. [x] New `components/CurrencyDropdown.jsx` — favorites + divider + alphabetical others, reads `settings.favoriteCurrencies` + `utils/iso4217.js`
393. [x] Settings → General → "Favorite currencies" card — drag-reorder, add (searchable picker over ISO 4217), remove (× disabled for main currency), one-shot migration seeding from `SUPPORTED_CURRENCIES`
394. [x] Replace every inline `CURRENCIES = [...]` constant and free-text currency input in the codebase with `CurrencyDropdown`
395. [x] Main-currency auto-add: when the user picks a new main currency, add it to favorites at the top if absent

**Sub-phase 33b — Last-known price persistence on stock profile + HQ country lookup verification**

### SPEC-029 Stock Profile Resolution — Phase 33 items
396. [x] Extend `stockProfiles` with `lastKnownPrice: { amount, currency, fetchedAt } | null`
397. [x] First-time resolve writes `lastKnownPrice` from the price the resolution dialog already fetched for the candidate
398. [x] `marketDataClient.getLatestPrice` updates `lastKnownPrice` on every successful provider fetch (skipped when `isManual === true`)
399. [x] Re-resolve rewrites identity fields (name, exchange, currency) AND `lastKnownPrice`; other fields preserved
400. [x] Offline / failed-fetch read sites fall back to `profile.lastKnownPrice` before showing "—"; clock-icon indicator + tooltip with `fetchedAt`

### SPEC-027 Market Data Integration — Phase 33 items (HQ country, promoted from Phase 11)
400a. [x] **HQ country lookup verification pass.** All four implemented adapters return `hqCountry`. IBKR, Finnhub, Stooq are not implemented. No adapter changes needed.
400b. [x] **Refresh profile writes hqCountry.** Background `getMarketProfile` call fires after resolution dialog confirm (StockProfileResolutionDialog) and after re-identify ticker (StockPage TickerRenameDialog onConfirm); writes `hqCountry` from first-non-null adapter result.
400c. [x] **HQ country fallback display.** `getEffectiveHqCountry(profile)` helper in stockProfiles.js; EditProfileDialog now reads/writes `hqCountryOverride`; InvestmentReports row-builder + inline country edit, DividendPage, StockInventory all use the helper.

**Sub-phase 33c — Configurable cache TTLs + offline fallback + per-page Reset API** ✓ done

### SPEC-027 Market Data Integration — Phase 33 items
401. [x] `settings.apiCacheTtl = { pricesMin, forexMin, newsMin, intradayMin }` with current values as defaults; Settings → Investments → "API call frequency" card with one row per category
402. [x] Reads consult cache → in-flight dedup → fresh fetch; respect the configured TTL
403. [x] Offline fallback: when every enabled provider fails, return the most recent cached value regardless of staleness; surface a ⏱ icon + tooltip with cache age
404. [x] `resetPageCaches(pageId)` helper — pages register their data dependencies (prices / forex / news / intraday / dividend history / profiles)
405. [x] "Reset API" button at the right end of the page action row on: Investments overview, Stock page, Stock inventory, Dividend page, Investment reports, Buy-Sell planning. Spinner + completion toast
406. [x] Settings → Storage → "API dividend history" card: per-ticker list capped at 20 rows tall, vertical scroll, sorted alphabetically by ticker

**Sub-phase 33d — Re-identify button rename + Stock inventory wider table** ✓ done

### SPEC-029 Stock Profile Resolution — Phase 33 button rename
407. [x] Rename "Rename ticker" button → "Re-identify ticker" in TickerRenameDialog launch point on Stock page header

### SPEC-033 Stock inventory — Phase 33 items
408. [x] Stock inventory table widens to full container width; ticker column sticky-left when horizontal scroll is needed
409. [x] Per-row "🔍 Resolve" action button opens TickerRenameDialog with the row's ticker pre-loaded
410. [x] Edit profile dialog opens the resolution flow first (candidates pre-loaded); "Switch to manual fields" fallback button collapses to free-form fields; HQ country / dividend frequency / estimation rule / tax % override / paysDividends remain editable in a "Settings" section of the same dialog

**Sub-phase 33e — No-dividends flag + paysDividends consumers + per-country tax** ✓ done

### SPEC-020 Dividends — Phase 33 no-dividends flag
411. [x] `stockProfiles.paysDividends: bool | null` with default null = unknown/treated as paying
412. [x] Editable from Edit profile dialog (both Stock page and Stock inventory entry points); Stock inventory shows ⊘ icon in dividend-frequency column when false
413. [x] Consumers honour the flag: Dividend page calendar + metrics + chart exclude the stock; Stock page hides Refresh dividends button, shows "—" + tooltip on TTM / Fwd / Div-return tiles, excludes from forward-yield calc; "Add dividend" account-picker omits the company
413a. [x] **paysDividends escape hatch.** When the user clicks `+ Dividend` on a flagged ticker, render an inline "clear flag and continue?" correction prompt instead of silently omitting the ticker (see SPEC-020 § No-dividends flag)

### SPEC-020 Dividends — Phase 33 per-country tax (formerly item 178; unblocked by HQ country work in 33b)
413b. [x] Settings → Investments → "Per-country dividend tax" card lists country → tax % rows. Add / edit / remove with inline rows. Country picker shows ISO countries. Stored on `settings.dividends.perCountryTaxPercent: { [country]: number }` (the field already exists in the SPEC-020 settings shape)
413c. [x] Resolution order at dividend creation becomes: **payout input → stock profile override → per-country (using `hqCountryOverride ?? hqCountry`) → global default**. The country level slots between stock and global per the SPEC-020 hierarchy
413d. [x] Existing dividend records keep their snapshotted `taxPercent` (history is never rewritten). Only newly-created dividends consult the country level

**Sub-phase 33f — Dividend status model + cash-deferral + auto-promotion** ✓ done

### SPEC-020 Dividends — Phase 33 status model
414. [x] `dividends.status: 'received' | 'pending-payment' | 'pending-confirmation'`; `source: 'user' | 'api-auto'`; `confirmedAt: ISO | null`; `cashMovementId` becomes nullable
415. [x] `createDividend` sets status based on: payoutDate vs today + `settings.dividends.confirmReceipt` toggle. No cashMovement written for non-`'received'` states
416. [x] Auto-promote pending-payment → received (or pending-confirmation when toggle ON) on app boot and after relevant data mutations; auto-write cashMovement on promotion
417. [x] Auto-recalculate share count from lots for pending-payment records with `exDividendDate > today`; once `exDate ≤ today` lock the share count (recalc happens during `promoteDividends()` on the final promotion pass)
418. [x] Pending-payment record with shares = 0 is dropped on promotion (dismissable banner in App.jsx)

**Sub-phase 33g — Confirmation flow + Pending tab** ✓ done

### SPEC-020 Dividends — Phase 33 confirmation flow
419. [x] `settings.dividends.confirmReceipt: bool` (default false) — Settings → Investments toggle
420. [x] When toggle ON: auto-create pending-confirmation `dividends` records from `apiDividendHistory` rows reaching payDate ≤ today on tickers with held shares on `exDate − 1`; one per account; `source: 'api-auto'`; auto-filled share count + tax %

### SPEC-032 Dividend page — Phase 33 Pending tab
421. [x] Dividend page new "Pending" tab — list of pending-confirmation rows with [Confirm] / [Edit] / [Skip] actions per row + "Confirm all" bulk button; count badge on the tab
422. [x] Top-nav badge next to Investments dropdown shows pending-confirmation count; click → Dividend page Pending tab

**Sub-phase 33h — Multi-account dividend entry + duplicate warning** ✓ done

### SPEC-020 Dividends — Phase 33 multi-account + duplicate warning
423. [x] Stock-scoped "Add dividend" form (entry from Stock page + Dividend button, Dividend page Add dividend): identity fields once + per-account row table with auto-filled share counts + Include checkboxes
424. [x] Account-scoped entry (from InvestingAccountDetail) preserves single-account form behaviour
425. [x] Duplicate-warning check on save: existing `dividends` (any status) or `apiDividendHistory` row for same `(ticker, exDividendDate)` OR `(ticker, payoutDate)` triggers the warning dialog with [Same dividend] / [Different dividend (add anyway)] choices

**Sub-phase 33i — Stock page dividend list bug fixes + delete + lots expand** ✓ done

### SPEC-021 Stock Page — Phase 33 items
426. [x] Net column rendered for declared / manual / API rows using current shares (or shares on exDate − 1 once past) and resolved tax %
427. [x] Source column width constrained + ellipsis; action column reserved width; Edit / Delete / Declare buttons stay inside the row at desktop widths
428. [x] 🗑 Delete button on every user dividend row; confirmation prompt summarising per-share × shares × tax; also deletes linked cashMovement when status === 'received'
429. [x] Today-date dividend appears only in the past half (≤ today); future-payout date columns corrected (Ex-div from exDate, Pay from payDate)
430. [x] Future-dated user dividend leak fix: row never appears twice across past/future halves; classification is by payoutDate consistently
431. [x] Tax % input added to ConvertToDeclaredDialog and standalone Declare dialog; `apiDividendHistory` rows gain optional `taxPercent` field
432. [x] Positions section rows are expandable; expand reveals per-lot table (Buy date / Days remaining vs 366d / Shares / Price w/o fee / Fee per share / Cost w/ fee / Total w/ fee); weighted-avg summary row at the bottom

**Sub-phase 33j — Dividend page calendar actions + metrics rewrite + chart enhancements** ✓ done

### SPEC-032 Dividend page — Phase 33 calendar / metrics / chart
433. [x] Calendar table: ticker column clickable to Stock page; ✎ Edit + 🗑 Delete per row backed by user `dividends` record
434. [x] Metrics table: company cell clickable when grouped by company
435. [x] Last 12-months amount metric reworked: sum of user `dividends.netTotal` (status `'received'`, payoutDate in `[today − 1y, today]`); excludes pending records and uses per-record stored shareCount (which reflects holdings on ex-div date)
436. [x] Next 12-months amount metric reworked: declared rows with exDate ≤ today use `getOpenLots(asOfDate = exDate − 1)`; declared rows with exDate > today use current open lots; estimated rows use current open lots; held set expanded to include tickers with pending receivables even if current open lots = 0
437. [x] Payout chart: per-bar tooltip with Paid / To be paid breakdown (past = paid only, future = to-be-paid only, current bucket = both); respects gross / net toggle
438. [x] Payout chart "Grouped by period" toggle: one cluster per quarter / month / week label, one bar per year inside each cluster; dashed-fill for "to be paid" portion preserved; disabled for year bucket

**Sub-phase 33k — CSV import composite-key dedup + post-commit report** ✓ done

### SPEC-025 Investment CSV Import — Phase 33 items
439. [x] Transaction dedup by external ID when present, else composite `(date, ticker, shares, price, type)`
440. [x] Dividend dedup by composite `(payoutDate, ticker, shareCount, dividendPerShare, currency)`
441. [x] Done-screen report: one row per parsed CSV line with status + reason; filter pill `All / Imported only / Not imported only / Errors only`; per-row "Edit row" (for errors, re-commit) / "View existing record" (for duplicates)

**Sub-phase 33l — Buy-Sell planning disregard cash + overspend + max fee** ✓ done

### SPEC-034 Buy-Sell Planning — Phase 33 items
443. [x] "Disregard cash balance" toggle in Overview block; cash-impact table Start column = 0 per currency; cash-balances panel muted; `scenario.ignoreActualBalances` persisted per scenario
444. [x] Cash-impact table new "Overspend" column right of End; per-currency shortfall (absolute value); red tint when > 0; "—" when 0
445. [x] Cash-impact and dividend-impact table alignment fix: header align matches column data align; currency code in its own narrow right-aligned column; Start always shows a value (0.00 when literal zero, never blank)
446. [x] Trading fees: optional `maximumFee` field per exchange and per stock; Settings UI gains "Max fee" input next to "Min fee"; validation `max >= min` when both set; `resolveTradingFee` becomes `clamp(gross × feePercent / 100, minFee, maxFee ?? Infinity)`

**Sub-phase 33m — Small / muted text contrast pass** ✓ done

### SPEC-015 UI Enhancements — Phase 33 contrast pass
447. [x] Define `--text-muted: #94a3b8` (≈6.6:1) and `--text-faint: #7c8da4` (≈5.1:1) in `app/src/styles/tokens.css`; both WCAG AA on `#0f1117`
448. [x] 624 `color:` usages of `#94a3b8`, `#64748b`, `#475569` replaced across 38 CSS modules with `var(--text-muted)` / `var(--text-faint)`
449. [x] 177 sub-12 px font sizes (9/10/11 px) raised to 12 px; one 8 px chevron also fixed
450. [x] Spot-check pass at 100 % and 125 % zoom on every screen

**Sub-phase 33o — Negative cache for failed fetches** ✓ done

### SPEC-027 Market Data Integration — Phase 33 negative cache
455. [x] `settings.apiCacheTtl.failureCooldownMin` (default 15) added; surfaced as a new row in Settings → Investments → "API call frequency" card with hint explaining the cooldown after a full-chain failure
456. [x] `cooldowns: { prices, news, intraday }` bucket added to `rmoney_market_data_cache`; entries store `{ failedAt }` only (timestamp, no error text / URL / credential material per SPEC-031)
457. [x] `marketDataClient.getLatestPrice` / `getNews` / `getIntradaySeries` / `getHistoricalSeries`: on full-chain failure write a cooldown marker for the `(category, ticker, exchange)` key; on success clear it. The `historical` category covers every `(period, resolution)` combination for that `(ticker, exchange)` so one chart-range failure suppresses all chart ranges until the cooldown elapses
458. [x] Reads consult the cooldown after the success-cache miss and before `dedup`/`callChain`: if cooling down, fall through to stale-cache → `lastKnownPrice` → reject with `unavailable (cooldown)`; never enter the provider chain
459. [x] `resetPageCaches(pageId)` clears cooldown entries for the page's data deps; `clearAllMarketCaches` clears all cooldowns; `clearCacheForTicker(t)` clears cooldowns for that ticker; `forceRefresh: true` bypasses the cooldown for one call without clearing it
460. [x] Cooldown short-circuits emit a `logCall` entry with `outcome: 'cooldown-skip'` so the debug panel shows why a ticker didn't refetch; `getCacheStats()` includes a `cooldownEntries` total

**Sub-phase 33n — Backup format versioning + v1 → v2 migration + Stronghold vault embed** *(lands with v0.34.0 since it depends on the dividend status model)*

### SPEC-016 Data Portability — Phase 33 items
451. [x] Bump the exported `version` string to `rmoney-data-v2` and document the v1 → v2 deltas in the SPEC-016 "Backup format versioning + migration" block
452. [x] Loader accepts both `rmoney-data-v1` and `rmoney-data-v2` via `ACCEPTED_VERSIONS`; `migrateBackup(parsed)` applies pure `migrateDividendsArrayToV2` / `migrateStockProfilesArrayToV2` / `migrateSettingsObjectToV2` transforms to the in-memory payload before `importAppData` writes v2-shape data. Other deltas (`paysDividends`, `lastKnownPrice`, `apiCacheTtl`, `maximumFee`, `dividends.confirmReceipt`) are handled by existing read-time defaults.
453. [x] `validateImportData` rejects unknown versions with a clear error. For `rmoney-data-vN` where `N > current`: "This backup was saved by a newer version of rMoney. Update the app to load it." For totally unknown version strings: `Unknown file version "<v>"`.
454. [x] Round-trip test pass: export v1 backup (existing user data on v0.32.0) → load into v0.33.0+ → verify dividends gain `status='received'`, stockProfiles gain `confirmed`, settings gain `favoriteCurrencies`. Verified on the real app 2026-05-28 before tagging v0.34.0.

### SPEC-031 Security and secrets — item 241a (bundled with 33n)
241a. [x] Full Backup mode prompts for the master passphrase via `FullBackupPassphrasePrompt`; `verifyPassphrase()` re-loads Stronghold against the existing vault file; `readVaultBytes()` returns the encrypted snapshot bytes; payload embeds them under `_strongholdVault` (base64). On restore, `writeVaultBytes()` writes the snapshot to the destination's appData vault path and sets `rmoney_vault_created`; the existing unlock screen prompts for the backup's master passphrase after reload. Tauri capabilities extended with binary fs ops (`fs:allow-read-file`, `fs:allow-write-file`, `fs:allow-exists`, `fs:allow-mkdir`) scoped to `$APPDATA/vault.hold` and `$APPDATA`.

---

# Release strategy

GitHub releases are tracked separately in [`RELEASE.md`](../RELEASE.md). Summary:

- **Versioning:** SemVer 0.X.Y, marked "Pre-release" on GitHub until the project is feature-complete enough for 1.0.
- **Cadence:** one tag per completed phase milestone (e.g. `v0.32.0` for the Phase 32 milestone, `v0.33.0` for the Phase 33 milestone). Patch tags (`v0.X.1`, `v0.X.2`) for bug-fix-only releases between phases.
- **Platforms today:** Windows desktop only (Tauri `.msi` + NSIS `.exe`). Linux/macOS desktop and Android mobile added when their build pipelines come online.
- **Process today:** fully manual local build + manual `gh release create`. GitHub Actions is documented as the next-step migration path in `RELEASE.md`.
- **Mobile:** gets its own release line via Capacitor (`.apk`) once Phase 21 ships.
