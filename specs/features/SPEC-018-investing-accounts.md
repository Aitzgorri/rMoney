---
id: SPEC-018
name: Investing Accounts
status: done
created: 2026-04-23
---

# Investing Accounts

## Goal
Introduce a top-level "Investments" section in the app, separate from the budgeting side, and give the user multiple *investing accounts* (broker accounts, bank investment accounts, etc.) that hold both **stock positions** and **cash balances**. Each investing account can hold many cash balances, one per currency (e.g. a single IBKR account with USD, EUR, and CZK balances). The user funds cash balances by transferring money in from budgeting accounts, withdraws back to budgeting when needed, and can run standalone currency exchanges between cash balances. Stock buys, sells, and dividends (SPEC-019, SPEC-020) flow into and out of these cash balances — the direct "link a buy to an account+envelope" model has been replaced by this explicit cash-balance layer.

## User Stories
- As a user, I can navigate to a separate "Investments" section from the main nav, so investment tracking doesn't clutter my budgeting screens.
- As a user, I can create multiple investing accounts — one per broker / bank / trading platform — so my holdings at different institutions stay distinct.
- As a user, each investing account shows me all its cash balances (one row per currency), so I always see how much uninvested cash I have where.
- As a user, I can deposit money from a budgeting account into an investing-account cash balance, picking an envelope in the budgeting side so the envelope reflects the outflow.
- As a user, I can withdraw money from an investing-account cash balance back to a budgeting account, picking an envelope so the budgeting side records the inflow.
- As a user, I can run a currency exchange between two of my own cash balances in the same investing account (e.g. pre-fund USD from EUR ahead of a planned buy), with a rate I can adjust and an optional fee.
- As a user, I can let a cash balance go negative when I confirm it — useful for entering historical transactions out of order, or when my broker actually permits margin.
- As a user, when I create a new cash balance I see the opening balance default to 0, and I can override it if I'm onboarding an account that already had money in it.

## Acceptance Criteria

### Top-level Investments section
- [x] Main navigation gains a top-level "Investments" entry, distinct from Budgeting. The existing budgeting nav (Accounts, Transactions, Envelopes, Categories, Planning, Dashboard, Bills & Income, Scheduled Transfers) stays exactly as-is.
- [x] Clicking "Investments" lands on an Investments home screen showing all investing accounts with a rollup of each account's cash-balance total in main currency via SPEC-017. Each card shows a "Positions: N stocks" line when the account has open positions. *(Market-value total including positions deferred to SPEC-027.)*
- [x] **Investments dropdown** (added by SPEC-030): clicking the "Investments" nav entry opens a dropdown rather than navigating directly. Menu entries: **Investments overview** (the home screen above), **Portfolios** (SPEC-022), **Watchlists** (SPEC-030). Future investments-related screens (Reports — SPEC-024, Benchmarks — SPEC-023) will be added to this dropdown when their specs are implemented. Selecting any item navigates the user to that screen. The dropdown trigger may carry a small badge (e.g. count of triggered alerts from SPEC-030) when there is something requiring attention in any of its destinations.

### Persistent account selection
- [x] When the user selects an investing account and then navigates away (to any other screen), on returning to the Investments screen the previously selected account is automatically re-selected. The user does not need to click the account again to see its details.
- [x] The last-selected account ID is stored in `rmoney_settings` under the key `lastSelectedInvestingAccountId`. On mount, the Investments screen reads this value and pre-selects the account only if it still exists. If the account was deleted in the meantime, the screen starts with no account selected.
- [x] The user can always click a different account card to change the selection; the new selection is immediately persisted.

### Investing accounts (CRUD)
- [x] User can create an investing account with: institution name (e.g. "Interactive Brokers", "Revolut", "XTB"), user-given account name (e.g. "IBKR Roth"), and optional note. **No currency is stored on the investing account itself** — currencies live on the cash balances.
- [x] User can edit institution, name, note after creation without affecting cash balances or transactions.
- [x] User can delete an investing account only when every cash balance has zero activity (only a zero opening balance is allowed). Otherwise deletion is blocked with a clear message. *(Stock-transaction and dividend checks deferred to SPEC-019/020.)*
- [x] **Default CSV-import template (Phase 36f).** Optional reference to a default template (see SPEC-025), nullable. The investing-account create/edit form exposes a "Default CSV template" `<select>` listing every template from `getCsvTemplates()` with a "— None —" sentinel; the chosen id is persisted to `defaultCsvTemplateId`. The CSV import screen pre-selects this template when the user starts an import for the account.
- [x] Investing accounts do NOT appear in the SPEC-002 cash/bank account list, and SPEC-002 accounts do NOT appear in the investing-account list. They are separate collections with separate UIs.

### Cash balances (per investing account)
- [x] An investing account owns zero or more cash balances, each tied to one ISO-4217 currency. Uniqueness: at most one cash balance per `(investingAccountId, currency)` pair.
- [x] User can create a cash balance manually by picking a currency and an opening balance (default: 0). The opening balance is recorded as the first entry in the cash balance's movement history, labelled "Opening balance" and not linked to any budgeting transaction.
- [x] Cash balances are also **auto-created** when a stock transaction needs a currency that doesn't yet exist in the investing account (triggered by deposit/withdrawal full-model and by buy/sell with cross-currency source or proceeds).
- [x] User can edit a cash balance's opening balance after creation (rare, for correcting onboarding mistakes). Changes to the opening balance flow through all derived "current balance" calculations.
- [x] User can delete a cash balance only when it has zero activity beyond a zero opening balance.
- [x] Current balance = opening balance + sum of all cash movements (deposits, withdrawals, exchanges, buys/sells/dividends/fees attached to this balance).

### Cash movements — deposits (budgeting → cash balance)
- [x] User can deposit money into a cash balance by choosing: source SPEC-002 budgeting account, source envelope (SPEC-004), amount, and destination cash balance (in the same investing account).
- [x] The deposit creates a linked **expense transaction** in the selected budgeting account + envelope. It is flagged `linkedFromInvestments: true`.
- [x] **Cross-currency deposit (full model):** when the budgeting account's currency differs from the destination cash balance's currency, the form offers two options: (A) auto-exchange — the budgeting expense lands in a matching-currency cash balance (auto-created if needed), then a `currency-exchange` stock-transaction record is created to convert to the destination balance at the user-supplied rate (with optional FX fee); (B) land in the matching-currency balance only and exchange manually later. The matching-currency balance is auto-created with opening 0 if it does not yet exist.

### Cash movements — withdrawals (cash balance → budgeting)
- [x] User can withdraw money from a cash balance by choosing: source cash balance, destination SPEC-002 budgeting account, destination envelope, amount (in the cash balance's currency).
- [x] The withdrawal creates a linked **income transaction** in the selected budgeting account + envelope, flagged `linkedFromInvestments: true`.
- [x] **Cross-currency withdrawal (full model):** when currencies differ, the form offers two options: (A) auto-exchange and withdraw — a `currency-exchange` record converts the source balance to a matching-currency balance (auto-created if needed) at the user-supplied rate, then a withdrawal is created from the matching-currency balance to the budgeting account; (B) exchange to matching-currency balance only and withdraw manually later. Symmetric with the deposit full model.

### Cash movements — standalone currency exchange
- [x] User can exchange between two cash balances of the same investing account at any time: pick source balance, target balance, source amount, rate (user-entered), optional fee with its own currency.
- [x] The exchange writes two `cashMovement` rows (source debit + target credit) linked by a shared `linkedExchangeId`, plus an optional fee row. *(Writing a `stockTransactions` parent record of type `currency-exchange` is deferred to Phase 12e.)*

### Negative balance policy
- [x] Any write (withdrawal, exchange, fee) that would take a cash balance below 0 triggers a confirmation dialog showing the currency, the before balance, and the resulting negative amount. User must confirm to proceed; Cancel leaves the balance unchanged.
- [x] The confirmation is shown once per operation, at save time. Once confirmed and saved, the negative balance is treated normally by downstream math (rollups, reports).
- [x] A persistent warning badge (⚠) is shown on the cash balance's row in the account detail view whenever its current balance is negative, so it doesn't get silently forgotten.

### Mobile layout (account detail page)
On phone-width viewports (`≤ 640px`, the app's `PHONE` breakpoint) the account-detail action rows reflow so nothing wraps or overlaps:
- [x] **Cash balance rows stack.** The currency + amount stay together on their own full-width row (never wrapping or overlapping the buttons); the action buttons (Deposit / Withdraw / Exchange / edit / delete) move onto the row(s) directly below it, **right-aligned**. On desktop they remain side-by-side as before.
- [x] **Positions header stacks.** The action buttons (+ Buy, + Buy crypto, + Dividend, Transfer, Import CSV) move below the "Positions" headline. Each button is wide enough that its label never wraps (`white-space: nowrap`), the buttons grow to fill the width and flow across multiple rows as needed, and the group never overflows the viewport. On desktop the buttons stay inline next to the headline.

### Linked-transaction integrity
- [x] Deposit and withdrawal movements can be deleted from the account detail view's movement list. Deleting a movement also deletes its linked budgeting transaction, so both sides are always removed together.
- [x] Linked budgeting transactions (`linkedFromInvestments: true`) are blocked from deletion in the Transactions screen. The delete button is replaced with a note directing the user to remove the movement from the Investments screen instead.
- [x] Clicking any movement row (except the opening-balance row) in the account detail view expands an inline detail panel below the row. A second click collapses it. Only one row is expanded at a time.
- [x] For deposit and withdrawal rows, the detail panel shows the amount, date, and a "Edit linked transaction →" button. For cross-currency deposits/withdrawals it also shows the budgeting-side amount (with its currency) and the derived exchange rate (computed as `cashAmount / budgetingAmount` for deposits, `budgetingAmount / cashAmount` for withdrawals).

### Cash-movement display grouping
- [x] Fee movements (`buy-fee`, `sell-fee`, `exchange-fee`) are **not shown as separate rows** in the cash-movements list. Instead, they are merged into their parent transaction: the parent row displays the net amount (gross ± fee), and the fee is shown in the detail panel when the row is expanded.
- [x] The detail panel for a buy row shows: ticker, exchange (if set), shares, price, fee (if > 0), average price per share including fee (if fee > 0), total cost, and transaction ID (if set).
- [x] The detail panel for a sell row shows: ticker, exchange (if set), shares, price, fee (if > 0), average net proceeds per share after fee (if fee > 0), net proceeds, and transaction ID (if set).
- [x] The detail panel for a currency-exchange row shows: the amount sold, the amount bought (with currencies), and the fee (if any).

## UI / Screens

Investments home:

```
+------------------------------------------------------------------+
| Investments                                      [+ New account] |
+------------------------------------------------------------------+
| IBKR Roth                         total: 485 200 CZK              |
|   Cash:  USD $1 250   EUR €500   CZK 0                            |
|   Positions: 8 stocks                                             |
|                                                                   |
| Revolut                           total:  42 100 CZK              |
|   Cash:  EUR €1 650                                               |
|   Positions: 2 stocks                                             |
+------------------------------------------------------------------+
| [Reports]   [Portfolios]   [Benchmarks]                           |
+------------------------------------------------------------------+
```

Investing account detail:

```
+------------------------------------------------------------------+
| IBKR Roth                                                         |
+------------------------------------------------------------------+
| Cash balances                              [+ New cash balance]   |
|   USD  $1 250.40      [Deposit] [Withdraw] [Exchange]             |
|   EUR  €500.00        [Deposit] [Withdraw] [Exchange]             |
|   CZK  −12 000 ⚠      [Deposit] [Withdraw] [Exchange]             |
+------------------------------------------------------------------+
| Positions                                   [+ Buy] [+ Sell]      |
|   AAPL  15 sh  @ $165 avg  ...                                    |
|   ...                                                             |
+------------------------------------------------------------------+
| Cash movements  (filter: [All ▼])                                 |
|   2026-04-22  Buy AAPL 10 @ $175.20        -$1 762.00             |
|   2026-04-22  Exchange EUR→USD              +$50.00 (−€45)        |
|   2026-04-20  Deposit from Checking         +€500                 |
|   2026-04-01  Sell MSFT 3 @ $410             +$1 230                |
|   ...                                                             |
+------------------------------------------------------------------+
```

New cash balance form (inline per SPEC-015):

```
+---------------------------------------------+
|  New cash balance — IBKR Roth               |
|  Currency:         [USD ▼]                  |
|  Opening balance:  [0.00]                   |
|                      [Cancel]   [Save]      |
+---------------------------------------------+
```

Deposit form (sample — cross-currency case):

```
+--------------------------------------------------------+
| Deposit into IBKR Roth                                  |
|                                                         |
|  From account:   [Checking — CZK ▼]                     |
|  From envelope:  [Savings ▼]                            |
|  Amount:         [10 000 CZK]                           |
|  Into cash balance: [USD ▼]                             |
|                                                         |
|  Cross-currency detected.                               |
|    [✓] Auto-exchange at 24.20 CZK/USD (SPEC-027 rate)   |
|        Override rate: [24.25]   Fee: [0 CZK]            |
|    [ ] Land in CZK balance; exchange later              |
|                                                         |
|                         [Cancel]   [Save]               |
+--------------------------------------------------------+
```

Negative-balance confirmation:

```
+--------------------------------------------------------+
|  ⚠ Negative balance                                     |
|                                                         |
|  This will take your USD balance at IBKR Roth from      |
|  $1 250.40 to −$500.00.                                 |
|                                                         |
|  Do you want to proceed?                                |
|                           [Cancel]   [Proceed]          |
+--------------------------------------------------------+
```

## Data

`investingAccounts` collection:

```
{
  id: string,
  institution: string,
  name: string,
  defaultCsvTemplateId: string | null,
  note: string | null,
  createdAt: ISO timestamp
}
```

`cashBalances` collection (each belongs to exactly one investing account):

```
{
  id: string,
  investingAccountId: string,
  currency: string,                      // ISO 4217
  openingBalance: number,                // default 0; user may override at creation
  createdAt: ISO timestamp
}
```

`cashMovements` collection — every change to a cash balance is a movement record, unified shape covers all movement types:

```
{
  id: string,
  type: 'opening' | 'deposit' | 'withdrawal' | 'currency-exchange'
      | 'buy' | 'sell' | 'buy-fee' | 'sell-fee' | 'transfer-fee'
      | 'exchange-fee' | 'dividend',
  date: ISO date,
  cashBalanceId: string,                 // the balance this movement affects
  amount: number,                        // signed; negative = balance decreased

  // for deposit / withdrawal: the linked budgeting transaction
  linkedBudgetingTransactionId: string | null,

  // for buy / sell / currency-exchange / fees: the parent stock transaction (SPEC-019)
  linkedStockTransactionId: string | null,
  // for dividend movements: the parent dividend (SPEC-020)
  linkedDividendId: string | null,

  // snapshotted exchange rates (main, USD, EUR, GBP, CZK) at the movement's date,
  // when relevant for reporting — only populated for types that affect invested/realized math
  exchangeRatesSnapshot: { main: number, usd: number, eur: number, gbp: number, czk: number } | null,

  createdAt: ISO timestamp
}
```

Notes on the movements model:
- **One row per balance touched.** Each `cashMovement` record affects exactly one cash balance (`cashBalanceId`). A transaction that touches two balances (e.g. a currency exchange) produces **two linked movement rows** that share the same `linkedStockTransactionId` pointing to a parent record on `stockTransactions` (SPEC-019).
- An `opening` movement is written automatically when a cash balance is created. Its `amount` equals `openingBalance`. Editing `openingBalance` on the balance re-syncs this movement.
- A `currency-exchange` writes two rows of `type: 'currency-exchange'`: a source-side debit (negative `amount`) and a target-side credit (positive `amount`). Both point to the same parent `stockTransactions` record, which holds the rate, gross amounts, and fee. If the exchange carries a fee, a third row of `type: 'exchange-fee'` is written on the fee-currency cash balance.
- Buy / sell / dividend / fee movements are created by SPEC-019 and SPEC-020 and point back to the parent investment record. Editing or deleting a parent cascades to its associated movements.

### Positions table — Phase 27b
- [x] The positions list in the investing account detail is replaced with a configurable table (`ConfigurableTable` shared component). Available columns: ticker, name, latest price, currency, exchange, shares, price/share (fee-inclusive avg cost), avg price (cost basis, fee-exclusive), MV in trading currency, MV in main currency, share-on-account %, change (%), change (trading currency), change (main currency) — 14 columns total.
- [x] Users can show/hide columns via a column-picker panel that closes when clicking anywhere outside it. Column visibility and order are persisted to localStorage under the key `rmoney_positions_columns_{accountId}` so each account remembers its own layout.
- [x] Columns can be drag-reordered in the column picker. The table is sortable by any visible column (click header to toggle asc/desc).
- [x] The table has a maximum height showing approximately 20 rows with internal scroll; a fullscreen-expand button opens the table in a full-viewport modal. The toolbar (including the exit button) is always rendered inside the overlay so it remains accessible.
- [x] **Action-modal z-index above fullscreen overlay (Phase 32 / item 369):** when the user clicks a row action (Sell / Dividend / row detail) on the Positions table while the table is in fullscreen, the action's modal renders **above** the fullscreen overlay so the user can interact with it. `InvestingAccountDetail.module.css` bumps `.overlay` and `.txOverlay` to `z-index: 600`, strictly above `ConfigurableTable.fullscreenOverlay` (500) and `.movementsFullscreenSection` (300). Same convention applies anywhere `ConfigurableTable` is used (future Reports table tab in Phase 29d): any action-modal overlay rendered by the host screen must use `z-index ≥ 600`.
- [x] Today's session change is shown in three separate columns: **Change (%)** (percentage of previous close), **Change (trading)** (total position value change in trading currency = `(price − prevClose) × shares`), **Change (main)** (same converted to main currency). All three show "—" when previousClose is unavailable. All three are visible by default.
- [x] Async data (latest price + previousClose from Yahoo, name, exchange from stock profile) is fetched on mount; cells show "—" while loading.

### Positions & movements polish *(Phase 45)*
- [x] Positions-table column labels are shortened to keep the table compact: **Latest price → "Latest Pr"**, **Shares → "Sh#"** (the full name remains available via the header tooltip below). *(Phase 45e)*
- [x] Every Positions-table column header shows a **tooltip on hover** giving the full column name / description. Implemented via shared `ConfigurableTable` `title` support (`title={col.title ?? col.label}` on the `<th>`), so the tooltip capability is available to every `ConfigurableTable` in the app. *(Phase 45e)*
- [x] **Asset-movements** rows no longer produce a horizontal scrollbar on hover. (Root cause: the `.movementRowClickable:hover` negative-margin bleed (`margin: 0 -6px`) overflowed its container; fixed by removing the bleed so the highlight stays within the row's box.) *(Phase 45f — verified the movements container overflow stays 0 on hover.)*

### Cash movements UX — Phase 27c
- [x] The cash-movements list has a max-height scrollable container. Records beyond the visible area are chunk-loaded (50 records per "Load more" click).
- [x] A collapsible filter bar sits above the movements list. It is collapsed by default; the open/closed state persists per account in localStorage. The bar contains four `HybridFilterDropdown` multi-selects: movement type, portfolio, stock (ticker), and cash balance / currency.
- [x] The type filter covers all movement types shown to the user: buy, sell, transfer-fee, dividend, deposit, withdrawal, currency-exchange. Fee sub-types are merged into parent rows and not selectable separately.
- [x] The portfolio and stock filters operate via the `linkedStockTransactionId` / ticker of each movement. OR logic within each filter; AND logic across filters.

### Cash movements readability + overview cleanup — Phase 27d
- [x] Cash-movement rows use a larger font size (14px) and alternating stripe background for better readability.
- [x] A fullscreen-expand button on the cash-movements panel header opens the movements list in a CSS-driven full-viewport overlay.
- [x] The "Portfolios" shortcut button at the bottom of the Investments overview screen is removed.

### Stock page enhancements — Phase 28

#### Sub-phase 28a — Currency view toggle ✓ DONE
- [x] `CurrencyToggle` shared component (pill "Trading | Main") built; persists last choice per screen in localStorage. Added to Stock page header; hidden when trading === main currency.
- [x] Currency toggle affects all metric tiles and dividend past-payout amounts.

#### Sub-phase 28b — Metrics row overhaul ✓ DONE
- [x] **TTM yield**: API dividend history for past 12 months ÷ current price, with user-record gap-fill. Includes all dividend types (regular + special). **Cost-based variant** (`TTM on cost`) uses weighted-average fee-inclusive cost per share as denominator.
- [x] **Forward yield**: `lastRegularPerShare × frequencyMultiplier ÷ currentPrice`; frequency from `detectEffectiveDividendFrequency`; shows "—" when frequency unknown or no regular history. **Cost-based variant** (`Fwd on cost`) uses weighted-average cost per share.
- [x] **Dividend return** split into two tiles: "Div return (all-time)" and "Div return (L12M)"; both show gross primary and net-after-tax in subtitle.
- [x] **P.a. return** rebuilt as XIRR (`utils/xirr.js` Newton-Raphson) over buy/sell/dividend/terminal-MV cash flows in main currency.
- [x] Total return formula: `totalReturn = (MV − totalInvested) + netDividends`.
- [x] **Yield-tile info popups (`YieldDetailDialog`)**: ⓘ button on every yield tile opens a modal with full per-dividend breakdown, denominator formula, and 4-decimal result.

#### Sub-phase 28c — Multi-account total row + portfolio % share ✓ DONE
- [x] Positions section: when the same stock is held in ≥ 2 investing accounts, a bold **Total** subtotal row is appended showing total shares, weighted-average fee-inclusive cost per share, and total market value (in display currency per the toggle; "—" when no price).
- [x] Portfolio memberships table: `% share` column added — position MV ÷ portfolio total MV × 100, computed live after prices are fetched for all tickers in the portfolio; shows "—" while loading or when a price is unavailable. Existing target % column retained.

## Out of Scope
- Interest accrual on cash balances. If the broker pays money-market interest, the user records it as a deposit with a chosen envelope on the budgeting side (or leaves it out — the interest appears as income when they withdraw to their bank).
- Scheduled / recurring deposits. Phase 2 has manual deposits only.
- Cash balances in currencies other than ISO 4217 (e.g. stablecoins as a distinct currency). Crypto is a separate asset class tracked later.
- Transferring cash balances between investing accounts (i.e., an ACAT-style cash transfer between brokers). Phase 2 models this as Withdrawal to budgeting + Deposit back from budgeting, since the cash typically does pass through a bank account in the real world.
- Visualising a cash balance's history as a time-series chart. The movement list is the Phase 2 view.
- Importing deposits/withdrawals from a budgeting CSV — the budgeting-side CSV import (not in scope of this spec) does not know about investing cash balances.

## Open Questions
None.
