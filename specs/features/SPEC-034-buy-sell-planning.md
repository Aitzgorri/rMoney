---
id: SPEC-034
name: Buy-Sell Planning
status: ready
created: 2026-05-14
---

# Buy-Sell Planning

## Goal
Give the user a sandbox screen for **planning trades before executing them**. The user assembles a list of candidate buys and sells across all investing accounts, sees the cash impact in every relevant currency (with FX simulation), the resulting cash positions, and the dividend-yield consequences of the proposed trades. Plans are **named scenarios** that can be saved, reloaded, and optionally executed (a row's "Execute" button opens the matching real Buy / Sell form pre-filled). Nothing on this screen modifies real data until the user explicitly executes.

This screen exists because the existing flow forces the user to mentally compute "if I buy 10 SGRO at 950 GBp and sell 5 AAPL at 175 USD, do I have enough EUR to cover the GBP shortfall, and what happens to my monthly dividend income?" — calculations the app already has all the inputs for.

## User Stories
- As a user, I can plan multiple buys and sells in one screen and see the total cost, fee, and cash-balance impact across every currency before I commit anything.
- As a user, I can pick stocks I already hold (for sells, with lot picker), and add stocks to plan to buy by ticker — using the SPEC-029 resolution flow if the ticker is new.
- As a user, I can configure trading fees once (per stock exchange, per stock) in Settings, and the planning screen pre-fills those defaults — but I can override the fee inline for a specific planned row without changing the saved defaults.
- As a user, I can check / uncheck individual planned rows to see how the calculation changes, without deleting rows from the scenario.
- As a user, I can see calculations at row level in the **trade currency** and (optionally) in the **main currency** by toggling a column on or off — the column-picker model from `ConfigurableTable`.
- As a user, I can see overall calculations summed in any of the currencies I tick (typically: trade currencies of the planned rows, plus main currency).
- As a user, I can name a scenario (e.g. "April rebalance"), save it, close the app, and reload it later. I can keep multiple scenarios.
- As a user, I can convert a saved scenario row into a real transaction with one click — this opens the existing Buy or Sell form pre-filled with the row's values, and once saved the planned row is marked "executed" (and optionally removed).
- As a user planning sells, I see how many of my available shares are held more than 365 days (long-term hold) so I can take capital-gains tax into account when picking lots.
- As a user, I see how the planned trades change my forward dividend yield and monthly dividend amount (gross + net), so I understand the income trade-off of selling a high-yielder to buy a lower-yielder (or vice versa).

## Acceptance Criteria

### Screen entry + scope
- [ ] New page **Buy-Sell Planning** accessible from the **Investments nav second-row tab** alongside `Investments overview / Portfolios / Watchlists / Benchmarks / Dividends` (six tabs total once SPEC-032 ships).
- [ ] Each scenario can include rows for **any** investing account; the destination/source investing account is picked per row.
- [ ] User can create, name, rename, save, duplicate, and delete scenarios. A scenario list at the top of the screen (or a dropdown) lets the user switch between saved scenarios. The currently-loaded scenario name is shown in the page header.
- [ ] The scenario auto-saves on every edit so the user does not have to remember to save explicitly. Unsaved local edits are not possible — every change persists immediately.

### Screen layout
- [ ] Top section: **Overview** (per below) — always visible, sticky on scroll.
- [ ] Middle section: **Sells** table (above) and **Buys** table (below). Sell-table is rendered above buy-table per the user's preference (selling first to fund buys reflects the typical mental flow).
- [ ] Each table has its own row-add control; row-add for buys opens a stock-picker modal (existing or SPEC-029-resolved tickers), row-add for sells opens a position-picker scoped to currently held positions across all investing accounts.
- [ ] Both tables use the shared `ConfigurableTable` component (Phase 27b) so the user can hide / reorder columns and the layout is persisted in localStorage per-table.

### Sell rows — fields and columns
Always-visible columns (cannot be hidden):
- [ ] **Include checkbox** — row participates in the calculation when checked. Unchecked rows remain in the scenario but do not affect totals.
- [ ] **Ticker** (clickable, navigates to Stock page).
- [ ] **Investing account** — picker; shows only accounts that hold the stock; if multiple, defaults to the largest position.
- [ ] **Number of shares to sell** — user-editable; constrained to ≤ available shares on the picked account.
- [ ] **Available shares to sell** — read-only; sub-line shows "(N held > 365 days)" as a long-term-hold hint. Tooltip on the column header explains: "Long-term-hold count is informational; tax treatment depends on your jurisdiction."

Toggleable columns (default-visible unless noted):
- [ ] Company name.
- [ ] Stock exchange.
- [ ] Currency (trade currency).
- [ ] Currency rate vs main (live, with `~` indicator if from spot cache).
- [ ] **Last price** (live latest price in trade currency).
- [ ] **Adjusted price** — user picks one of: (a) the last price (default); (b) round-down to N decimals; (c) round-up to N decimals; (d) manual override. The chosen rule and decimal count are persisted on the row.
- [ ] **Fee amount** — pre-filled from fee defaults (see "Fee setup"); inline-editable per row.
- [ ] **Fee % of trade** — derived: `fee / (shares × adjustedPrice) × 100`.
- [ ] **Last actual dividend %** — `lastRegularPerShare × frequencyMultiplier ÷ adjustedPrice` (Forward yield from Phase 28b but using *the planned trade's adjusted price*, so the fee impact is visible in the yield).
- [ ] **Last actual dividend amount per month gross** — derived from the same payout × shares ÷ 12.
- [ ] **Last actual dividend amount per month net** — gross × (1 − resolved tax %).
- [ ] **Last year dividend %** — `sumLast12MonthsPerShare ÷ adjustedPrice` × 100 (TTM yield from Phase 28b but with the planned trade's adjusted price as denominator).
- [ ] **Last year dividend amount per month gross** — `sumLast12MonthsPerShare × shares ÷ 12`.
- [ ] **Last year dividend amount per month net** — gross × (1 − tax %).
- [ ] **Trade value (gross)** = `shares × adjustedPrice` (in trade currency).
- [ ] **Trade value (net of fee)** = `shares × adjustedPrice − fee`.
- [ ] **Trade value (main currency)** — converted via current FX (toggleable column).
- [ ] **Lot picker** (action button) — opens the same lot-picker modal used by the real Sell form (FIFO default, advanced override; respects the long-term-hold hint).

### Buy rows — fields and columns
Always-visible columns (cannot be hidden):
- [ ] **Include checkbox** — same semantics as sells.
- [ ] **Ticker** (clickable).
- [ ] **Investing account** — picker; **all** investing accounts allowed (defaults to the user's most-recently-used account).
- [ ] **Number of shares to buy** — user-editable.

Toggleable columns (default-visible unless noted):
- [ ] Company name, stock exchange, currency, currency rate vs main, last price, adjusted price (same rule set as sell-side).
- [ ] **Fee amount** + **Fee %** (same as sell-side).
- [ ] **Last actual dividend %** / per-month gross / per-month net — using the **buy's adjusted price + fee/share** as denominator (yield-on-cost-of-the-planned-trade), so the fee impact is visible.
- [ ] **Last year dividend %** / per-month gross / per-month net — same pattern.
- [ ] **Buy price including fee per share** = `(shares × adjustedPrice + fee) ÷ shares`.
- [ ] **Trade value without fee** = `shares × adjustedPrice` (trade currency).
- [ ] **Trade value with fee** = `shares × adjustedPrice + fee`.
- [ ] **Trade value (main currency, with fee)** — toggleable.

### Adjusted-price rule
- [ ] Each row has an **adjusted-price control**: a small dropdown next to the price column with options `Last price` / `Round down to N` / `Round up to N` / `Manual`. Selecting `Round down`/`Round up` exposes a decimal-count input (default 2). Selecting `Manual` exposes a number input.
- [ ] Adjusted price drives every downstream calculation in the row (trade value, fee %, dividend %, cash impact). Stored on the row.
- [ ] The unadjusted last price is still shown in its column for reference.

### Fee setup (canonical defaults in Settings → Investments → Trading fees)
- [ ] New **Trading fees** card on Settings → Investments tab.
- [ ] Per stock-exchange defaults: `{ exchange: MIC, currency: ISO, feePercent: number, minimumFee: number }`. Adding an exchange offers the resolved-MIC list from `marketDataExchanges.js`.
- [ ] Per-stock overrides: `{ ticker: string, feePercent: number, minimumFee: number, currency: ISO }` — references an existing `stockProfile`. Editable from the planning screen by clicking the fee column on a row.
- [ ] Resolution order at row creation: **per-stock override → per-exchange default → 0 (no fee)**. The applied fee is computed as `max(minimumFee, gross × feePercent)`.
- [ ] **Inline override on planning rows:** typing a number in the row's fee field overrides the resolved default for that row only — does NOT change saved defaults. A small dot indicator shows when a row's fee has been manually overridden; clicking it reverts to the resolved default.
- [ ] **Tooltip on the Fee column header** in the planning tables: "Defaults set in Settings → Investments → Trading fees. Edit per row to override for this scenario only."

### Overview block (above the sells table)
- [ ] **Cash balances panel** showing every currency the user holds across all investing accounts, totalled (per currency, not per account, because the planning screen treats funds as fungible — same as the real Cash impact calc below). One row per currency with the current total balance.
- [ ] **Add to cash balances** field per currency: a number input lets the user simulate "what if I deposited 5,000 USD before executing this scenario?" — purely for the planning calc; never persisted as a real deposit.
- [ ] **Cash impact summary**: starts from "current totals + planning-only top-ups", applies sells (credits), then applies buys (debits), then resolves any per-currency shortfall via simulated currency exchanges per the priority chain below. Final per-currency cash position is shown side-by-side with the starting position; deltas highlighted (green credit / red debit).
- [ ] **Currency-exchange priority** (matches real-trade behaviour, deterministic):
  1. For each buy, debit from the cash balance in the **same trade currency** first.
  2. If insufficient, debit the rest from the **main-currency balance** (auto-creating a simulated FX leg using the user-set or live rate).
  3. If main-currency balance is also insufficient, debit from any other balance with funds, in descending order of available value (converted to the trade currency).
- [ ] **Editable FX rates panel:** the overview includes a small FX-rates section listing every currency pair the calculation actually uses. Each pair pre-fills with the live SPEC-027 rate; the user can override any rate (e.g. to model a worst-case rate). Overrides apply to the planning-screen calc only, not to real transactions.
- [ ] **Currency-display picker:** the user ticks which currencies the **summary totals** should be expressed in. Defaults to all trade currencies of the included rows + main currency. Each ticked currency shows: total sells, total buys, net cash impact (sell − buy), starting balance, ending balance.
- [ ] **Weighted-average dividend metrics:**
  - Sells weighted-average yield (forward) and weighted-average per-month gross — across **included** sell rows, weighted by trade-value in main currency.
  - Buys weighted-average yield (forward) and weighted-average per-month gross — across included buy rows, same weighting.
  - **Difference** row: buys − sells in both yield and per-month amount, in main currency. Shows the dividend-income consequence of executing the scenario.
  - All three rows show net (after-tax) figures alongside gross.

### Execution + lifecycle
- [ ] Each row carries an **Execute** action button. Clicking it opens the matching real form (`BuyForm` / `SellForm` from `InvestingAccountDetail.jsx`) pre-filled with the row's investing account, ticker, shares, adjusted price, fee, and (for sells) the lot allocations. The form opens in a full-screen overlay over the planning screen.
- [ ] On successful save the row is flagged `executedAt: ISO timestamp` and `executedTransactionId: string`. Executed rows are visually muted (struck-through ticker / faded background) and excluded from the included-row totals automatically (the Include checkbox is forcibly unchecked).
- [ ] User can choose, per scenario, whether executed rows are removed automatically or kept for history. Default: kept.
- [ ] Cancelling the form leaves the planned row untouched.

### Persistence
- [ ] Scenarios live in a new `tradingScenarios` collection in localStorage. Per-scenario shape stores: name, createdAt, updatedAt, sellRows[], buyRows[], cashTopUps{}, fxOverrides{}, displayedCurrencies[], removeExecutedRows: bool.
- [ ] Each row stores: ticker, exchange, currency, investingAccountId, shares, adjustedPriceRule, adjustedPriceValue (cached), manualFeeOverride, lotAllocations (sells only), included: bool, executedAt, executedTransactionId.
- [ ] Settings → Investments → Trading fees stores the per-exchange and per-stock fee defaults as part of the existing `rmoney_settings` blob.
- [ ] **Storage tab card** added (per CLAUDE.md data-persistence convention): "Buy-Sell Planning" card listing scenario count, total bytes, per-scenario breakdown with bulk-clear action.

## UI / Screens

```
+----------------------------------------------------------------------------+
| Buy-Sell Planning             Scenario: [April rebalance v] [+ New] [...]  |
+----------------------------------------------------------------------------+
| Cash balances           Top up                Display in: [x] EUR [x] USD  |
|   USD     $1 250.40    + [     ]                                           |
|   EUR     €  500.00    + [     ]                                           |
|   GBP     £   75.00    + [     ]                                           |
|                                                                            |
| FX rates  USD/EUR [0.92  ]   GBP/EUR [1.18  ]   GBP/USD [1.28  ]           |
|                                                                            |
| Cash impact (after included buys/sells, with simulated FX):                |
|         Start          Sells          Buys           End                   |
|   USD   $1 250.40      +$2 100.00     -$1 762.00     $1 588.40             |
|   EUR     €500.00       —              -€230.00       €270.00              |
|                                                                            |
| Dividend impact (forward, monthly net, in EUR):                            |
|   Sells avg yield 0.34 %  -> -€12.40 / mo                                  |
|   Buys  avg yield 2.18 %  ->  +€48.10 / mo                                 |
|   delta:    +1.84 pp      ->  +€35.70 / mo                                 |
+----------------------------------------------------------------------------+
| Sells                                       [+ Add sell] [Columns][Full]   |
|   [x] AAPL  IBKR Roth  10 / 35 (12 LT)  $176.00 (last $175.20)  Fee $1.00  |
|         Last yield 0.55 % · Last yr 0.51 % · Net month $0.07 each          |
|         Trade value $1 760 / $1 759 net   [Lot picker]   [Execute ->]      |
+----------------------------------------------------------------------------+
| Buys                                         [+ Add buy]  [Columns][Full]  |
|   [x] SGRO  IBKR Roth  240 sh   GBp 950 (last 950)   Fee £5.00 (£0.5%)     |
|         Last yield 5.85 % · Last yr 5.70 % · Net month £14.20              |
|         Trade value £2 280 / £2 285 with fee                               |
|         Cash source: GBP £75 + EUR shortfall €230 @ 1.18 (simulated FX)    |
|                                                            [Execute ->]    |
+----------------------------------------------------------------------------+
```

The toolbar `[...]` opens scenario actions: rename, duplicate, delete, toggle "remove executed rows on save".

## Data

`tradingScenarios` collection (new, localStorage):

```
{
  id: string,
  name: string,
  createdAt: ISO,
  updatedAt: ISO,
  sellRows: [
    {
      id: string,
      ticker: string,
      stockExchange: string,
      currency: string,
      investingAccountId: string,
      shares: number,
      adjustedPriceRule: 'last' | 'round-down' | 'round-up' | 'manual',
      adjustedPriceDecimals: number | null,
      adjustedPriceManual: number | null,
      manualFeeOverride: number | null,
      lotAllocations: [{ sourceBuyId, sharesFromLot }] | null,
      included: bool,
      executedAt: ISO | null,
      executedTransactionId: string | null
    }
  ],
  buyRows: [
    { same shape as sellRows minus lotAllocations }
  ],
  cashTopUps: { [currency: string]: number },
  fxOverrides: { [pair: string]: number },
  displayedCurrencies: [string],
  removeExecutedRows: bool
}
```

Settings extension (`rmoney_settings.tradingFees`):

```
{
  exchanges: [
    { mic: 'XLON', currency: 'GBP', feePercent: 0.0010, minimumFee: 5.00 },
    { mic: 'XNAS', currency: 'USD', feePercent: 0.0050, minimumFee: 1.00 }
  ],
  stocks: [
    { ticker: 'BYG', feePercent: 0.0008, minimumFee: 4.00, currency: 'GBP' }
  ]
}
```

Reads:
- `stockTransactions`, `stockProfiles`, `apiDividendHistory`, `dividends` (yield calcs).
- `cashBalances`, `getCurrentBalance` (cash totals).
- `getLatestPrice`, `getForex` (live price + FX).
- `getOpenLots` (sell-side available shares + LT-hold count).

Writes:
- `tradingScenarios` collection (CRUD).
- On Execute -> creates a real `stockTransactions` record via existing SPEC-019 paths; updates the row's `executedAt`/`executedTransactionId`.

## Out of Scope
- Multi-row execution in one click ("execute all included rows"). User executes one row at a time so each existing form can run its validation, FX-snapshot, and negative-balance dialog.
- Tax math beyond the long-term-hold count hint. Capital-gains tax modelling is jurisdiction-specific and belongs in a future spec.
- Real currency-exchange execution from the planning screen — the planning screen *simulates* FX legs but does not write `currency-exchange` records. If the user wants a pre-trade exchange they enter it via SPEC-018's standalone exchange flow before executing.
- Order types (market / limit / stop) — out of scope; the planning screen models a market-style execution at the adjusted price.
- What-if simulations across time (price drift, dividend declarations between now and execution). The screen models *current* prices and *current* dividend cadence.
- Sharing scenarios across users / devices — local only.

## Open Questions
None — all design decisions captured per the 2026-05-14 review.
