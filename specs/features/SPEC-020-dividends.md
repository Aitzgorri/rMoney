---
id: SPEC-020
name: Dividends
status: done
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
- [x] Stored fields on each dividend payout record: `exDividendDate`, `payoutDate`, `dividendPerShare` (before tax, in stock's currency), `shareCount` (eligible shares for this payout), `taxPercent` (snapshotted from the hierarchy at creation time), `exchangeRates` at payout date (null — deferred to Phase 10 historical-rate work).
- [x] Derived at display / report time (never stored): `totalBeforeTax = dividendPerShare × shareCount`, `taxAmount = totalBeforeTax × taxPercent`, `netTotal = totalBeforeTax − taxAmount`, `netPerShare = netTotal / shareCount`.
- [x] Editable fields on the dividend form: `dividendPerShare`, `taxPercent`, `taxAmount`. Tax % ↔ tax amount are bidirectionally linked in the create form (editing tax % recalculates tax amount; editing tax amount recalculates tax %; per-share/share-count changes recompute amounts while keeping tax % or tax amount as the canonical field depending on which was last edited). *(Edit form for existing records deferred — current MVP allows create and delete.)*
- [x] **Cash landing:** on save, the net payout (`netTotal`) is credited to the investing account's cash balance matching the dividend's currency (auto-created with opening 0 if absent). A `cashMovement` of `type: 'dividend'` is written with `linkedDividendId` pointing back to this record. **No direct link to a budgeting account + envelope exists**.
- [x] Tax amount is withheld by the broker — only the net lands in the cash balance; tax amount is recorded on the dividend for display but no separate movement is written for it.

### Tax hierarchy
- [x] Global default tax % at More → Settings. Applied when no other level is set.
- [ ] Per-country tax %: deferred — requires SPEC-027 HQ country lookup.
- [x] Per-stock tax % override stored in `stockProfiles` (`rmoney_stock_profiles`); `upsertStockProfile(ticker, { taxPercentOverride })`.
- [x] Per-payout tax % lives on the record itself (snapshotted). Bidirectionally editable at creation time.
- [x] Resolution order at creation: **payout input** (manually set) → **stock profile override** → **global default**. Country level skipped until SPEC-027. Stamped onto record; hierarchy changes do not rewrite history.

### Future payout projections (ephemeral)
- [x] Next 4 projected payout dates derived from historical cadence (median gap between consecutive payouts, snapped to Monthly/Quarterly/Semi-annual/Annual). Requires ≥ 2 past payouts.
- [x] Amount estimation rules: `last-paid` (most recent per-share), `year-ago` (closest payout 1 year ago), `manual` (per-stock stored amount). Global default in Settings → Investments → Dividends card; per-stock override via dropdown on the stock page.
- [x] State badges: `estimation` (all local projections), `amount estimated` (future: API confirms date only), `declared` (future: API confirms date + amount). Badge renders as dashed row with muted styling.
- [x] Share count for projected net = current open position size; tax % from the resolved tax hierarchy (`resolveDividendTaxPercent`).
- [x] "Record a second payout to enable date projections" hint when only 1 historical payout exists.

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
  shareCount: number,
  currency: string,                  // stock's dividend currency
  taxPercent: number,                // snapshotted at creation
  exchangeRates: {                   // at payout date
    main: number, usd: number, eur: number, gbp: number, czk: number
  },
  cashMovementId: string,            // the credit movement on the matching-currency cash balance
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
  amountEstimationRule: 'last-paid' | 'year-ago' | 'manual',  // defaults to global
  manualEstimatedAmount: number | null // only used when rule === 'manual'
}
```

Global settings:

```
settings.dividends = {
  defaultTaxPercent: number,            // global default
  perCountryTaxPercent: { [country: string]: number },
  defaultAmountEstimationRule: 'last-paid' | 'year-ago' | 'manual',
  defaultManualEstimatedAmount: null     // unused for 'last-paid'/'year-ago'
}
```

## Out of Scope
- Automatic ingestion of dividend records from a broker feed. SPEC-027 reports declarations (dates + amounts); actual received payouts are recorded by the user (or via CSV import SPEC-025).
- Dividend reinvestment (DRIP) automation — the user enters a Dividend + a Buy manually.
- Qualified vs. non-qualified dividend distinction (US tax concept).
- Home-country tax credit for foreign withholding. The tax hierarchy models source-country withholding only (per Q9/a). A future spec can layer home-country tax on top.
- Special / one-off distributions that aren't part of a regular cadence — entered as normal dividends but may skew the projection algorithm. For Phase 2, users can mark specific payouts to exclude from cadence detection (nice-to-have, not required in this spec).

## Open Questions
None.
