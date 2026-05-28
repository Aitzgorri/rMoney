---
id: SPEC-020
name: Dividends
status: in-progress
created: 2026-04-23
---

# Dividends

## Goal
Record every dividend payout the user has received on a stock, with correct multi-currency snapshotting, a four-level tax-rate override chain, and bidirectional tax % ↔ tax amount editing. The net payout lands in the investing account's cash balance that matches the dividend's currency (SPEC-018) — auto-created if one doesn't exist. Beyond recorded payouts, project the next four upcoming payouts for each held stock on the stock page as *ephemeral* projections — computed at render time, never stored — with three distinct states (`estimation`, `amount estimated`, `declared`) based on what the API reports.

## User Stories
- As a user, I can record a dividend payout with ex-dividend date, payout date, per-share amount, share count, tax %, and the auto-calculated totals, so my realized income is tracked correctly.
- As a user, I can edit dividend-per-share, tax %, or tax amount on a recorded payout. If I change tax %, the tax amount recalculates; if I change tax amount, the tax % recalculates; if I change per-share, the totals recalculate and tax % stays as the rate.
- As a user, I can set a global default tax rate, override it per country (using the stock's HQ country), and override further per stock or even per individual payout — the app resolves the right rate at payout creation and snapshots it so later rate changes don't rewrite history.
- As a user, I can see on a stock page the next 4 projected dividend payouts, each marked as `estimation`, `amount estimated`, or `declared` depending on what the API has confirmed.
- As a user, I can pick the estimation rule per stock — last-paid amount, same-period previous year, or a manually-set amount — with a global default in Settings.
- As a user, when a dividend is recorded the net payout lands in the investing account's cash balance for the dividend's currency (auto-created if I don't yet have one), so my cash balance reflects income without my having to enter it twice.

## Acceptance Criteria

### Dividend records
- [x] Stored fields on each dividend payout record: `exDividendDate`, `payoutDate`, `dividendPerShare` (before tax, in stock's currency), `shareCount` (eligible shares for this payout), `taxPercent` (snapshotted from the hierarchy at creation time), `type: 'regular' | 'special'` (default `'regular'`; user-editable on the create form), `exchangeRates` at payout date (null — deferred to Phase 10 historical-rate work).
- [x] Stored fields on each dividend payout record (Phase 33): `status: 'received' | 'pending-payment' | 'pending-confirmation'` (default `'received'` when payoutDate ≤ today and the global "Confirm receipt" toggle is off; `'pending-payment'` when payoutDate > today; `'pending-confirmation'` when payoutDate ≤ today and the global toggle is on). Cash impact happens only when status transitions to `'received'`.
- [x] Derived at display / report time (never stored): `totalBeforeTax = dividendPerShare × shareCount`, `taxAmount = totalBeforeTax × taxPercent`, `netTotal = totalBeforeTax − taxAmount`, `netPerShare = netTotal / shareCount`.
- [x] Editable fields on the dividend form: `dividendPerShare`, `taxPercent`, `taxAmount`. Tax % ↔ tax amount are bidirectionally linked in the create form (editing tax % recalculates tax amount; editing tax amount recalculates tax %; per-share/share-count changes recompute amounts while keeping tax % or tax amount as the canonical field depending on which was last edited). *(Edit form for existing records deferred — current MVP allows create and delete.)*
- [x] **Cash landing:** on save, the net payout (`netTotal`) is credited to the investing account's cash balance matching the dividend's currency (auto-created with opening 0 if absent). A `cashMovement` of `type: 'dividend'` is written with `linkedDividendId` pointing back to this record. **No direct link to a budgeting account + envelope exists**.
- [x] Tax amount is withheld by the broker — only the net lands in the cash balance; tax amount is recorded on the dividend for display but no separate movement is written for it.
- [x] **Cash landing is deferred when status ≠ 'received' (Phase 33):** when a dividend is saved with `status: 'pending-payment'` or `status: 'pending-confirmation'`, **no** `cashMovement` is written. The record exists for display/projection only. The cash credit is created when the status transitions to `'received'` — either automatically on the payoutDate boundary (pending-payment → received when the toggle is off) or on explicit user confirmation (pending-confirmation → received). Transitioning back to a non-received status (rare — e.g. user reverts confirmation) deletes the associated cashMovement.
- [x] **Auto-fill `shareCount` from lot history (Phase 32 / item 365):** when the user enters or changes `exDividendDate` on the dividend form, the share-count field auto-populates with the total open shares for the ticker on the selected investing account as of `exDividendDate − 1` day (the day before ex-dividend, when the entitled holder of record is determined). The user can override the auto-filled value (typing into the field does not re-trigger the auto-fill, but a subsequent ex-dividend-date change does re-fill since the as-of-date computation has new input). Reason: the broker pays dividends to whoever held the shares the day before the ex-dividend date; computing this from `getOpenLots(ticker, accountId, asOfDate=exDividendDate − 1)` removes a manual lookup that is easy to get wrong. A small "auto-filled from lots on YYYY-MM-DD" hint renders below the field whenever the value comes from auto-fill; the hint disappears when the user overrides. If the ticker has no open position on `exDate − 1`, the field stays empty and a warning chip "No shares held on YYYY-MM-DD" is shown. The `getOpenLots` helper now accepts an optional `asOfDate` argument that filters every consumed transaction (buys, sells, transfers, splits) to dates ≤ `asOfDate`.
- [x] **Cash-landing verification (Phase 32 / item 365a):** SPEC-020 §"Cash landing" already requires net dividends to be credited to the matching-currency cash balance via a `cashMovement` of `type: 'dividend'`. The 2026-05-14 user report ("dividend cash not visible in movements list") was investigated and the data path is intact end-to-end: `createDividend` writes a `cashMovement` row of `type: 'dividend'` carrying `linkedDividendId`; `getAccountCashMovements(accountId)` returns it unconditionally (no type filter); `getCurrentBalance(cashBalanceId)` sums every movement on the balance including dividends; the `MovementRow` component renders `type === 'dividend'` rows with full detail panel. The original report most likely reflected a stuck filter selection in the `HybridFilterDropdown` introduced in Phase 27c. (No automated integration test added — the codebase has no test runner; adding one solely for this verification would conflict with the project's "no over-engineering, keep dependencies minimal" rule.)

### No-dividends flag *(Phase 33)*
- [x] **Stocks that pay no dividends opt out** of every dividend surface. `stockProfiles` gains a `paysDividends: bool | null` field (default `null` — unknown/treated as paying). When set to `false`, the stock is excluded from: Dividend page calendar + metrics tab, Stock page "Refresh dividends" button (hidden), Stock page TTM / Fwd / Div-return tiles ("—" with tooltip "this stock does not pay dividends — Edit profile to change"), forward-yield calculations everywhere, the "Add dividend" account-picker (the company simply isn't offered).
- [x] The flag is user-editable from: Stock page header (Edit profile dialog) and Stock inventory (Edit profile dialog). The Stock inventory shows a small ⊘ icon in the dividend-frequency column when `paysDividends === false`.
- [x] User dividend records that **already exist** on a stock marked `paysDividends: false` are preserved (history is never destroyed) but no further dividend updates are projected.
- [x] **Escape hatch — never trap the user.** When the user clicks the Stock page `+ Dividend` action on a ticker whose profile has `paysDividends === false`, instead of silently omitting it from the account-picker, render an inline correction prompt: *"{TICKER} is marked as not paying dividends. Clear flag and add anyway?"* with [Cancel] and [Clear flag and continue] buttons. The latter sets `paysDividends: null` on the profile (back to unknown) and proceeds into the normal multi-account dividend form. Same behaviour from the Dividend page's "Add dividend" entry when the user picks a flagged ticker via search.

### Multi-account dividend entry *(Phase 33)*
- [x] **Single form, multiple records.** The "Add dividend" flow (via the Stock page header `+ Dividend` button and via the Dividend page "Add dividend" entry) opens a form that takes the dividend identity ONCE (ex-div date, payout date, per-share amount, currency, tax %, type) and lists every investing account that holds the ticker on `exDividendDate − 1`. Each account row shows the auto-filled share count (editable) and an "include" checkbox (default on). Saving creates one `dividends` record per included row, sharing the same identity fields but with per-account share counts. Each record still credits its own account's matching-currency cash balance.
- [x] When the user enters the dividend from a single-account context (e.g. on `InvestingAccountDetail.jsx`), the form opens in single-account mode (locked to that account), preserving the current behaviour. The multi-account flow only triggers when the entry point is stock-scoped, not account-scoped.
- [x] If the user un-ticks an account, that account's row is skipped and no record is created for it; if the user re-ticks, the row's share count re-fills from the lot history.

### Status-model migration *(Phase 33)*
- [x] **One-shot migration at app boot.** Every existing `dividends` row missing the `status` field is stamped with `status: 'received'`, `source: 'user'`, `confirmedAt: createdAt`, and `cashMovementId` kept as-is (existing user records reflect already-impacted cash). Idempotent — skip rows whose `status` is already defined. Lives in `data/dividends.js` `migrateDividendStatuses()`, invoked once from `App.jsx` boot path alongside the other migrations.
- [ ] Pre-migration backups (`.rmy` files exported under v0.32.0 or earlier) load cleanly into v0.33.0: the import path runs the same migration over the loaded data before commit, so the loaded records pick up `status: 'received'` automatically. No backup-format version bump needed for this field alone, but see SPEC-016 for the broader v2 backup discussion.

### Future user-entered dividends — recalculation on holdings change *(Phase 33)*
- [x] **Future-dated user dividends (payoutDate > today) are saved with `status: 'pending-payment'`** and **no cash impact** until the payout date arrives. They render in the unified dividend list as part of the "future" half (above the `Today —` divider) and on the Dividend page calendar.
- [ ] **Share count auto-recalculates** for pending-payment records when the user records a buy/sell that changes the shares held on `exDividendDate − 1`. Specifically: any pending-payment record whose `exDividendDate > today` re-derives `shareCount` from `getOpenLots(investingAccountId, ticker, asOfDate = exDividendDate − 1)` on every read. Once `exDividendDate ≤ today`, the share count is locked in (the user is entitled to the dividend on however many shares they held on the record date, even if they sold them later).
- [x] **Auto-promote to received on payoutDate:** when a pending-payment record's `payoutDate ≤ today` and the global "Confirm receipt" toggle is OFF, the status flips to `'received'` and the cash credit is written. When the toggle is ON, the status flips to `'pending-confirmation'` instead (no cash credit until the user confirms — see Confirmation flow below). The promotion runs at app boot and on every relevant data mutation.
- [x] If the user **sells all shares** in the account before `exDividendDate`, the pending-payment record's `shareCount` becomes 0; on auto-promotion it is dropped (no cashMovement written, record deleted) and a small toast notifies the user.

### Confirmation flow *(Phase 33)*
- [x] **Global toggle** in Settings → Investments: "Confirm receipt before cash impact" (default OFF). When ON, every dividend that would otherwise transition to `'received'` is set to `'pending-confirmation'` first. When OFF, records flow straight to `'received'` with cash impact as today.
- [x] **Pending-confirmation queue** lives on the Dividend page as a new tab (alongside Calendar and Metrics) labelled "Pending" with a count badge. Each row shows ticker · ex-div · pay date · per-share · shares · tax · net · account · source (user / API-declared) with [Confirm] and [Edit] and [Skip / delete] actions per row. Bulk "Confirm all" available.
- [x] **API-declared dividends auto-create pending-confirmation records:** when the toggle is ON and an `apiDividendHistory` row reaches `payDate ≤ today` AND the user holds shares of that ticker (current open lots in any account on `exDividendDate − 1`), the system creates a pending-confirmation `dividends` record per account with auto-filled share count, default tax % from the resolution hierarchy, and `source: 'api-auto'`. The user confirms or edits it before cash credit happens. Once confirmed the apiDividendHistory row is hidden by the standard dedup rule.
- [x] **Auto-create dedup guard.** Before creating an `'api-auto'` pending-confirmation record for `(ticker, exDividendDate, accountId)`, the auto-promoter checks whether **any** `dividends` row already exists for that exact triple (any status, any source). If one exists, skip — the user already has a record (manual entry that beat the auto-promoter, an earlier auto-create that wasn't yet confirmed, or a backup-restored row). This prevents duplicate pending rows when the user enters the dividend manually before the auto-promoter runs.
- [x] **Pending-confirmation badge** in the top nav (next to the Investments dropdown) shows the count of dividends awaiting confirmation across the app. Clicking it jumps to the Dividend page Pending tab.

### Duplicate dividend warning *(Phase 33)*
- [x] **On save**, the "Add dividend" form checks whether a `dividends` record (any status) or an `apiDividendHistory` row already exists for `(ticker, exDividendDate)` OR `(ticker, payoutDate)` (either match counts). If so, a warning dialog appears: "A dividend already exists for {TICKER} on this date: {summary}". Two confirm options:
  - **Same dividend** — close without saving the new record.
  - **Different dividend (add anyway)** — save the new record alongside the existing one. Both will appear in the list.
- [x] The warning is non-blocking — the user always has a way through. It catches the common "I clicked Add dividend twice" / "I forgot I already declared it" mistakes.

### Tax hierarchy
- [x] Global default tax % at More → Settings. Applied when no other level is set.
- [x] Per-country tax %: stored on `settings.dividends.perCountryTaxPercent`. Resolution order: per-stock override → per-country (using `hqCountryOverride ?? hqCountry`) → global default.
- [x] Per-stock tax % override stored in `stockProfiles` (`rmoney_stock_profiles`); `upsertStockProfile(ticker, { taxPercentOverride })`.
- [x] Per-payout tax % lives on the record itself (snapshotted). Bidirectionally editable at creation time.
- [x] Resolution order at creation: **payout input** (manually set) → **stock profile override** → **global default**. Country level skipped until SPEC-027. Stamped onto record; hierarchy changes do not rewrite history.

### Future payout projections (ephemeral)
- [x] Next 4 projected payout dates derived from historical cadence (median gap between consecutive payouts, snapped to Monthly/Quarterly/Semi-annual/Annual). Requires ≥ 2 past payouts in the merged input (see "Merged data source" below).
- [x] **Special dividends excluded from projections.** Cadence detection, amount estimation (`last-paid` and `year-ago`), and effective-frequency derivation all filter out records where `type === 'special'` (records with null/undefined `type` are treated as `'regular'`). Reason: special dividends are one-off distributions; including them would skew both the median cadence gap and the per-share amount used for the next projection. Applies symmetrically to user `dividends` records and `apiDividendHistory` entries used by `detectEffectiveDividendFrequency`.
- [x] Amount estimation rules: `last-paid` (most recent **regular** per-share), `year-ago` (closest **regular** payout 1 year ago), `manual` (per-stock stored amount). Global default in Settings → Investments → Dividends card; per-stock override via dropdown on the stock page.
- [x] State badges: `estimation` (all local projections), `amount estimated` (future: API confirms date only), `declared` (future: API confirms date + amount). Badge renders as dashed row with muted styling.
- [x] Share count for projected net = current open position size; tax % from the resolved tax hierarchy (`resolveDividendTaxPercent`).
- [x] "Record a second payout to enable date projections" hint when only 1 historical (regular) payout exists.

### Provider chain for dividend fetches
- [x] **Yahoo Finance is skipped for `getDividends`** — its `chart?events=div` endpoint only exposes `exDate` + `amount` and never returns a payment date or declared/future events. Returning that partial response would satisfy the failure-only chain and prevent richer providers (Twelve Data, Massive) from being called, leaving `payDate` permanently null and missing recently-declared payouts. Yahoo's `getDividends` adapter therefore throws `'not supported'` so the chain falls through. Yahoo still serves prices, profile, splits, search. Reason: 2026-05-15 NNN regression where the recorded ex-dates were correct but the pay-date column was always `—`. Affects records persisted before the fix — clicking "Refresh dividends" on the stock page re-fetches via Twelve Data / Massive and overwrites the existing rows (`upsertApiDividends` deduplicates on `exDate`, replacing the Yahoo-sourced record with the richer one).

### Merged data source for projections (Phase 28f-ii)
- [x] **Cadence and amount estimation merge user `dividends` and `apiDividendHistory`** with user records winning on `(ticker, exDate)` collisions — same merge-with-user-precedence rule used by past-payouts list (Phase 28d), TTM yield (Phase 28b), forward yield (Phase 28b), and `detectEffectiveDividendFrequency` (Phase 25d). Reason: a recently-bought stock may have zero user `dividends` records but plenty of API history — projections should still appear so the user can see what's coming.
- [x] **Section visibility extended.** The Dividends section on the Stock page renders whenever the user has an open position (`totalShares > 0`), even if there is no past or future record to display, so the standalone `+ Declare` button (below) remains reachable for newly-bought stocks.
- [x] **Standalone `+ Declare` button** on the Dividends section header — always visible while the section renders. Tooltip: "Enter a future expected dividend manually". Opens the same `ConvertToDeclaredDialog` used by the per-row `→ Declare` action, with empty / sensible-default fields (no estimated row to draw from). Writes to `apiDividendHistory` with `source: 'manual'`, `state: 'declared'`. Covers the case where the API genuinely doesn't return an upcoming declared dividend (provider lag, recent IPO, etc.). Post-payout dedup via the standard merge rule still applies.
- [x] **Unified dividend list.** Past and future records render as a single table on the Stock page (instead of separate "Past payouts" + "Upcoming" sections). Default order: future records first sorted ascending (nearest upcoming at top), a `Today — YYYY-MM-DD` divider row, then past records sorted descending (most recent past at top). Future rows carry a subtle background tint to reinforce the divider; the per-row state (`Declared` / `Manual` / `Estimated` / `User` / `API`) is shown in the `Source` column. Year-chunk lazy-load (Phase 28d) applies to the past portion as before.

### Dividend movements in account detail
- [x] Dividend cash movements appear in the account's Cash Movements list (type `'dividend'`), grouped with other movements.
- [x] Clicking a dividend row expands the detail panel showing: ticker, per share, shares, before-tax total, tax % and amount, net total, net per share, ex-dividend date, payout date.
- [x] Delete button on each dividend row removes both the dividend record and its linked cash movement atomically.
- [x] [+ Dividend] button in the Positions section header opens a blank dividend form.
- [x] [Dividend] button per position row pre-fills ticker, currency, and share count from that position.

## UI / Screens
Dividend entry form:

```
+--------------------------------------------------------+
| New dividend — AAPL                                    |
|   Ex-dividend date:  [2026-05-10]                      |
|   Payout date:       [2026-05-17]                      |
|   Per share:         [$0.25]    Shares: [15]           |
|   Total before tax:  $3.75                             |
|   Tax %:  [15]   Tax amount: [$0.56]   (linked)        |
|   Net total:   $3.19      Net per share: $0.213        |
|                                                         |
|   Net lands in USD cash balance (IBKR Roth)            |
|                                                         |
|                   [Cancel]       [Save]                 |
+--------------------------------------------------------+
```

Stock-page dividend section (SPEC-021 owns the full page; this is the dividend block):

```
Past payouts
  2026-02-14  AAPL  $0.24/sh  15 sh  15% tax  net $3.06
  2025-11-14  AAPL  $0.24/sh  10 sh  15% tax  net $2.04
  ...

Projected next 4
  2026-05-17  $0.25/sh  (amount estimated)   [declared badge if API confirms]
  2026-08-17  $0.25/sh  (estimation)
  2026-11-17  $0.26/sh  (estimation)
  2027-02-17  $0.26/sh  (estimation)
```

Settings — tax hierarchy:

```
Global default tax %:  [15]

Per-country overrides:
  United States    [15]
  Netherlands      [15]
  Germany          [25]   [+ Add country]

Per-stock overrides shown on each stock's page.
```

## Data

`dividends` collection:

```
{
  id: string,
  investingAccountId: string,
  ticker: string,
  exDividendDate: ISO date,
  payoutDate: ISO date,
  dividendPerShare: number,          // before tax, in stock currency
  shareCount: number,                // for pending-payment with future exDate: re-derived live from lots; for ≤today, locked
  currency: string,                  // stock's dividend currency
  taxPercent: number,                // snapshotted at creation
  type: 'regular' | 'special',      // default 'regular'; user-editable; affects forward-yield input
  status: 'received' | 'pending-payment' | 'pending-confirmation',  // Phase 33; default 'received'
  source: 'user' | 'api-auto',      // Phase 33; 'api-auto' = created by the toggle-on flow from apiDividendHistory
  confirmedAt: ISO timestamp | null,// Phase 33; set when status transitions to 'received'
  exchangeRates: {                   // at payout date
    main: number, usd: number, eur: number, gbp: number, czk: number
  },
  cashMovementId: string | null,     // Phase 33: null while status ≠ 'received'
  createdAt: ISO timestamp
}
```

Side effect on save: one `cashMovement` of `type: 'dividend'` is written on the matching-currency cash balance of the same investing account, with `linkedDividendId` pointing back to this dividend record. The cash balance is auto-created with opening 0 if none exists in that currency.

Per-stock settings (lives on the stock "profile" — separate from individual transactions):

```
{
  ticker: string,
  hqCountryOverride: string | null,    // defaults to SPEC-027 lookup
  taxPercentOverride: number | null,   // per-stock rate
  dividendFrequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'unknown',
                                       // default 'unknown'; API-filled on Refresh dividends;
                                       // user-editable from Edit profile (Phase 26b)
  amountEstimationRule: 'last-paid' | 'year-ago' | 'manual',  // defaults to global
  manualEstimatedAmount: number | null,// only used when rule === 'manual'
  paysDividends: boolean | null        // Phase 33; null = unknown/treated as paying; false = excluded from all dividend surfaces
}
```

Global settings:

```
settings.dividends = {
  defaultTaxPercent: number,            // global default
  perCountryTaxPercent: { [country: string]: number },
  defaultAmountEstimationRule: 'last-paid' | 'year-ago' | 'manual',
  defaultManualEstimatedAmount: null,    // unused for 'last-paid'/'year-ago'
  confirmReceipt: boolean               // Phase 33; default false; when true every cash-impacting dividend goes through pending-confirmation first
}
```

## Out of Scope
- Automatic ingestion of dividend records from a broker feed. SPEC-027 reports declarations (dates + amounts); actual received payouts are recorded by the user (or via CSV import SPEC-025).
- Dividend reinvestment (DRIP) automation — the user enters a Dividend + a Buy manually.
- Qualified vs. non-qualified dividend distinction (US tax concept).
- Home-country tax credit for foreign withholding. The tax hierarchy models source-country withholding only (per Q9/a). A future spec can layer home-country tax on top.

## Open Questions
None.
