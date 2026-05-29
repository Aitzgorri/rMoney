---
id: SPEC-019
name: Stock Transactions
status: in-progress
created: 2026-04-23
---

# Stock Transactions

## Goal
Record all lot-affecting events on stocks held in investing accounts — **buy**, **sell**, **transfer between investing accounts**, **split**, and **currency exchange** triggered by a buy — with correct cost-basis tracking, FIFO lot selection (with user override), multi-currency snapshotting, and proper flow of cash into and out of the investing account's **cash balances** (SPEC-018). Buys and sells never link directly to a budgeting account + envelope anymore — they debit or credit a cash balance inside the investing account. The budgeting side is involved only when money flows in or out of the investing account via a deposit or withdrawal (SPEC-018).

This spec covers stocks only. Dividends are SPEC-020. Other asset classes (options, bonds, crypto, metals) are placeholders in SPEC-024 reports and get their own specs later.

## User Stories
- As a user, I can record a stock buy with date, exchange (optional), ticker, shares, price, currency, transaction ID (optional), and fee (default 0). The cash is withdrawn from the investing account's cash balance that matches the trade's currency by default.
- As a user buying a stock in a currency where I don't have enough cash (or where I just want to record an exchange that actually happened), I can pick a different cash balance as the source and the app creates a currency-exchange transaction that sells the source currency to fund the buy.
- As a user, I can record a sell; proceeds land in the matching-currency cash balance. FIFO picks the lots by default but I can override via "Advanced: choose lots."
- As a user, I can edit an old buy's price or fee, and all later sells' cost basis and return calculations update retroactively.
- As a user, I can transfer shares between two investing accounts with partial transfer + lot selection. Cost basis is preserved, no cash moves with the transfer (shares only), and any transfer fee comes out of the source investing account's matching-currency cash balance.
- As a user, when the market-data API detects a split on a stock I own, I see a pending notification and on confirm my lots are adjusted. I can also enter splits manually.

## Acceptance Criteria

### Buy records
- [x] Buy form fields: date (required), stock ticker (required), stock exchange (optional), shares (required, > 0), price-per-share (required, > 0), currency (required, user-entered), transaction ID (optional), fee (default 0). *(Investing account comes from context; SPEC-027 price/exchange defaults deferred to Phase 11c.)*
- [ ] **Stock profile resolution (SPEC-029):** when the user enters a ticker that has no resolved `name` on its `stockProfile`, the SPEC-029 resolution dialog runs on blur of the ticker field (or on a "Look up" button press). The user confirms a candidate (or enters manually); the resolved `name`, `stockExchange`, and `currency` are persisted to the profile. If the buy form's `stockExchange` or `currency` fields were empty, they are pre-filled from the resolved profile. The buy cannot be saved while the profile is unresolved.
- [x] **Source cash balance:** automatically uses the investing account's cash balance matching the trade's currency. Auto-created with opening 0 if it does not yet exist.
- [x] If the source cash balance does not exist (the currency has no balance yet), the app creates one automatically with opening 0 and proceeds.
- [ ] If the selected source cash balance's currency differs from the trade's currency, saving the buy **also creates a currency-exchange transaction** — deferred to Phase 12e.
- [x] On save, exchange rates at the transaction date are snapshotted via `snapshotFxRates()` (SPEC-017). Stored as `exchangeRates: { mainCurrency, rateToMain, capturedAt }` on buy/sell records; `{ mainCurrency, sourceRateToMain, targetRateToMain, capturedAt }` on currency-exchange records; `null` on transfer and split. *(Phase 25a)*
- [x] Saving a buy writes a **cashMovement** (`type: 'buy'`) debiting the matching-currency cash balance by `shares × price`, and a second **cashMovement** (`type: 'buy-fee'`) debiting the same balance by `fee` when `fee > 0`.
- [x] If the buy would take the matching-currency cash balance negative, the negative-balance confirmation dialog (SPEC-018) is shown before save.
- [x] Weighted-average cost per share is recomputed for the stock+investing-account pair (display only — computed from remaining open lots).
- [x] Edit form for buy: edits date, exchange, shares, price, fee, transaction ID; recreates cashMovements and recaptures FX snapshot when date changes. Ticker and currency are non-editable to avoid cascading cost-basis changes. *(Phase 26c)*
- [x] Cost basis propagates retroactively on buy edits — `getOpenLots()` is fully dynamic; editing a buy's price or fee automatically updates all downstream sell cost-basis and open-lot calculations at read time. No explicit recalculation step needed.
- [x] Editing a buy's share count is blocked when the new value is less than shares already allocated to downstream sells and transfers — inline error message shows the allocated total. *(item 165)*

### Sell records
- [x] Sell form fields: date, ticker (select from open positions), exchange (optional), shares, price, currency (from position), transaction ID (optional), fee — plus a collapsed "Advanced: choose lots" disclosure.
- [x] Default behaviour without expanding: FIFO consumes lots from the oldest remaining buy in the same investing account until the sell quantity is met.
- [x] Expanded lot picker: lists every open lot for the stock (date, remaining shares, per-share cost), pre-filled with FIFO allocation, editable per-lot quantities. Validation: sum of lot quantities = sell's total shares.
- [x] **Per-lot upper bound (Phase 32 / item 367):** the per-lot share-input field is constrained to the lot's remaining shares. Typing a higher number is blocked at input time (clamped to the maximum) and the field's max attribute is set accordingly. A small "max N" hint renders next to the field. Reason: the existing "sum = total" validation lets the user enter values like `30 / 5` for a `35-share` sell that pass the sum check but allocate 30 shares from a lot that only has 25, leading to negative open-lot states. Applied to both `SellForm` (create) and `SellEditForm` (edit); the edit form clamps to the credit-restored remaining shares (open lots + the existing allocation re-added) so the user can redistribute up to what is truly available.
- [x] **Two-way binding lot quantities ↔ total shares (Phase 32 / item 368):** when the lot picker is expanded, the form supports two editing modes:
  - **From total → lots:** while the picker is open and the user has not yet touched any per-lot input, changing the top-level "Shares" field re-runs FIFO allocation across the lots.
  - **From lots → total:** when the user edits any per-lot quantity, the form switches to manual mode: the top-level "Shares" field auto-updates to the sum of all lot quantities, and subsequent edits to the shares field no longer re-allocate the lots. The user does not have to keep the two in sync manually.
  - Closing and reopening the lot picker resets to auto-mode (FIFO from the current "Shares" value).
  - Applied to both `SellForm` and `SellEditForm` via a `manualMode` state flag.
  Reason: most users plan a sale by deciding "I want to sell these specific old lots" rather than "I want to sell N shares" — the previous one-way binding from total to lots made that workflow needlessly cumbersome.
- [ ] **Proceeds destination cash balance selector** — deferred; currently always uses the matching-currency balance.
- [x] Auto-creates a matching-currency cash balance if it doesn't yet exist.
- [x] Saving a sell writes a **cashMovement** (`type: 'sell'`) crediting the matching-currency cash balance by `shares × price`, plus a **cashMovement** (`type: 'sell-fee'`) debiting the same balance by `fee` when `fee > 0`.
- [x] Exchange rates at sell date snapshotted via `snapshotFxRates()`. *(Phase 25a)*
- [ ] Realized P/L per lot — deferred to Phase 14 (Stock page).
- [x] Edit form for sell: edits date, exchange, shares, price, fee, transaction ID; lot picker always available for re-allocation; recreates cashMovements and recaptures FX snapshot when date changes. *(Phase 26c)*

### Transfers between investing accounts
- [x] Transfer form fields: date, source investing account (the account being viewed), destination investing account, ticker, shares, optional fee (default 0). — `TransferForm` in `screens/InvestingAccountDetail.jsx`; `Transfer` button lives in the Positions section header (between `+ Dividend` and `Import CSV`), only shown when at least one open position exists. Ticker is picked from the form's dropdown.
- [x] Partial transfer supported with FIFO default + "Advanced: choose lots." — Same lot-picker pattern as `SellForm`.
- [x] Cost basis and original buy date of each moved lot are preserved exactly — no realization event. — `getOpenLots()` synthesizes destination-side lots from the transfer's `lotAllocations`, copying each source buy's `date`, `price`, and `currency`.
- [x] **No cash moves with the transfer.** Cash balances are per-account and do not travel with shares. — `createTransfer()` writes only the stockTransactions record (plus the optional fee movement).
- [x] If `fee > 0`, the fee is debited from a cash balance the user picks in the source investing account. A `cashMovement` (`type: 'transfer-fee'`) is written, linked via `linkedStockTransactionId`. — Negative-balance confirmation hook is not yet applied to transfer fees (deferred); the form lets the user pick the cash balance from a dropdown showing current balances.
- [x] Edit form for transfer: edits date, shares (full lot picker for re-allocation with two-way binding and per-lot clamping), optional fee with cash-balance selector, and transaction ID. Destination account and ticker are non-editable. Triggered via the edit (✎) icon on a transfer-fee movement row; `updateTransfer()` data function already implemented. *(item 286)*

### Splits
- [ ] When SPEC-027 reports a split event for a held stock, a pending notification appears: "Detected 2:1 split on AAPL effective 2026-05-01 — apply?" — *deferred (requires SPEC-027)*
- [x] On **Apply**: every open lot for that stock in every investing account has its remaining shares multiplied by numerator/denominator and its per-share cost basis divided by the same ratio. A `split` stock-transaction record is written on each affected investing account so it shows in the transactions list. — Implemented via `applySplit()` in `data/stockTransactions.js`; effect is calc-at-read-time in `getOpenLots()` (preserves original buy records, scales lots whose date < split.date, translates pre-split sell allocations into post-split basis).
- [ ] On **Dismiss**: notification is cleared; lots are not modified; the split can still be entered manually later. — *deferred (requires SPEC-027 notification flow)*
- [x] Manual split entry form: date, ticker, ratio (e.g. 2:1, 1:10 reverse). — `+ Split` button in Stock page Positions section opens an inline form with effective date and "X for every Y old shares" ratio inputs; live hint indicates forward vs reverse split and effective multiplier.
- [x] Splits cannot be "un-applied" — to correct, delete the split record (reverses the ratio). — Since splits are applied dynamically at read time, deleting the split record restores the pre-split view automatically (no mutation to reverse).
- [x] Edit form for split: change date and/or ratio. Accessible via an edit (✎) button on each split row in the StockPage transaction list. Recalculation is automatic at read time via `getOpenLots`. *(Phase 26c / item 287)*
- [x] Splits have no cash-balance effect (no cashMovement written). — `applySplit()` writes only stockTransactions records, never cashMovements.

### Currency exchange (as a stock transaction type)
- [x] A currency exchange is represented as a **single record** — type `'currency-exchange'` — storing: date, investingAccountId, sourceCashBalanceId, sourceAmount, targetCashBalanceId, targetAmount, exchangeRate, optional fee (with its own currency), and `triggeredByStockTransactionId` (nullable — null when user initiates the exchange standalone from SPEC-018's exchange form).
- [x] An exchange writes two `cashMovement` rows of `type: 'currency-exchange'`: a debit on the source cash balance (`amount = −sourceAmount`) and a credit on the target cash balance (`amount = +targetAmount`), both sharing the same `linkedStockTransactionId` pointing to the exchange record. If a fee is specified it is debited from the fee currency's cash balance as a third `cashMovement` of `type: 'exchange-fee'`.
- [ ] A currency exchange that was **triggered by a buy** appears in the stock's transaction history on SPEC-021 alongside the buy. **Deferred — buy-triggered exchange flow not yet implemented.**
- [x] A standalone currency exchange (no `triggeredByStockTransactionId`) does **not** appear in any stock's history — it lives only in the investing account's cash-balance movement list (SPEC-018).
- [x] Editing a standalone exchange recalculates both `cashMovement` rows (date, amounts, fee). Triggered-exchange editing (linked to a buy) is deferred.

### Fee-currency invariant (buy and sell)
- [x] `createBuy()` and `createSell()` store `feeCurrency: currency` (the trade's currency) on every new record — making the assumed invariant explicit in the data model.
- [x] A one-time data migration backfills `feeCurrency` on existing buy/sell records that lack it; any record where `feeCurrency !== currency` is tagged `legacyFeeMismatch: true` instead.
- [x] `updateBuy()` and `updateSell()` validate `feeCurrency === currency` before saving; a mismatch throws an error surfaced as an inline message in the edit form.
- [x] The movement list renders a warning chip on any buy/sell row tagged `legacyFeeMismatch: true`. *(item 291)*

### Retroactive recalculation (applies to all types)
- [ ] Any edit to a buy record (price, fee, shares, date) that affects cost basis triggers recalculation of all downstream sells' realized P/L, all open-lot weighted averages, and any cached position values. Sells themselves are not edited — their cost-basis numbers are derived.
- [ ] Deletion of a buy is blocked if any sell or transfer drew from its lot and would otherwise be left without a basis. Error message explains which sell(s) are blocking.
- [ ] Deletion of a buy also deletes its associated `cashMovement` rows and reverses its triggering exchange (if any) — with confirmation.

## UI / Screens

Buy form (same-currency source — common case):

```
+--------------------------------------------------------+
| Buy AAPL                                                |
|   Date:    [2026-04-22]      Account: [IBKR Roth ▼]     |
|   Exchange: [NASDAQ ▼]                                  |
|   Shares:  [10]   Price: [$175.20]   Currency: [USD ▼]  |
|   Fee:     [1.00] USD           Txn ID: [opt]           |
|                                                         |
|   Pay from: [ USD ($1 250.40 available) ▼ ]             |
|                                                         |
|                          [Cancel]   [Save]              |
+--------------------------------------------------------+
```

Buy form (cross-currency source — exchange triggered):

```
+--------------------------------------------------------+
| Buy AAPL                                                |
|   ... (same as above)                                   |
|   Fee:     [1.00] USD                                   |
|                                                         |
|   Pay from: [ EUR (€500.00 available) ▼ ]               |
|                                                         |
|   Currency exchange required — EUR → USD                 |
|     Need: $1 753.00                                     |
|     Rate: [0.92] USD/EUR  (API: 0.923)  [Use API]        |
|     Source amount: €1 905.43                             |
|     FX fee:  [0] EUR                                     |
|                                                         |
|                          [Cancel]   [Save buy + exchange]|
+--------------------------------------------------------+
```

Sell form updated source selector:

```
Proceeds into: [ USD (matching trade) ▼ ]     (selecting another currency
                                               triggers an exchange after the sell)
```

Split pending notification and transfer form: unchanged from existing draft.

## Data

`stockTransactions` collection (now five types):

```
{
  id: string,
  type: 'buy' | 'sell' | 'transfer' | 'split' | 'currency-exchange',
  date: ISO date,
  investingAccountId: string,                 // source for transfer; the account for exchange
  destinationInvestingAccountId: string?,     // transfer only
  ticker: string | null,                      // null for currency-exchange
  stockExchange: string | null,
  shares: number | null,                      // null for currency-exchange
  price: number | null,                       // null for transfer, split, currency-exchange
  currency: string | null,                    // currency of `price`
  transactionExternalId: string | null,
  fee: number,                                // default 0
  feeCurrency: string | null,                 // buy/sell only; must equal `currency` (invariant)
  legacyFeeMismatch: true | undefined,        // buy/sell: set when feeCurrency !== currency at migration time

  // split only
  ratio: { numerator: number, denominator: number } | null,

  // sell + transfer
  lotAllocations: [ { sourceBuyId: string, sharesFromLot: number } ] | null,

  // currency-exchange only
  sourceCashBalanceId: string | null,
  sourceAmount: number | null,
  targetCashBalanceId: string | null,
  targetAmount: number | null,
  exchangeRate: number | null,                // target-per-source
  exchangeFee: { amount: number, currency: string } | null,
  triggeredByStockTransactionId: string | null,  // the buy (if any) that triggered this exchange

  // snapshotted rates at transaction date — null for split
  exchangeRates: { main, usd, eur, gbp, czk: number } | null,

  createdAt: ISO timestamp
}
```

Writes:
- Buy / sell / split / transfer-fee → one or two `cashMovement` rows on SPEC-018 cash balances, as described per-type above.
- Currency-exchange (whether triggered by a buy or standalone) → two `cashMovement` rows on the source and target cash balances, plus one for any FX fee.
- **No direct writes to SPEC-005 transactions from stock transactions or dividends anymore.** The only investments→budgeting write path is via SPEC-018 deposit/withdrawal flows.

## Out of Scope
- Short sells / borrowed shares.
- Options, bonds, crypto, precious metals.
- Tax-lot reporting for regulatory purposes.
- Corporate actions other than splits.
- Dividend reinvestment plans as a composite record — a DRIP is a Dividend (SPEC-020) + a Buy, entered separately.
- Cross-investing-account currency exchange — exchanges always happen within one investing account.

## Open Questions
None.
