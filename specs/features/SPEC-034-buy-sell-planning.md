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
- [x] New page **Buy-Sell Planning** accessible from the **Investments nav second-row tab** alongside `Investments overview / Portfolios / Watchlists / Benchmarks / Dividends` (six tabs total once SPEC-032 ships). *(Sub-phase 32g)*
- [x] Each scenario can include rows for **any** investing account; the destination/source investing account is picked per row. *(Sub-phase 32g)*
- [x] User can create, name, rename, save, duplicate, and delete scenarios. A scenario list at the top of the screen (or a dropdown) lets the user switch between saved scenarios. The currently-loaded scenario name is shown in the page header. *(Sub-phase 32g)*
- [x] The scenario auto-saves on every edit so the user does not have to remember to save explicitly. Unsaved local edits are not possible — every change persists immediately. *(Sub-phase 32g — every mutator in `data/tradingScenarios.js` writes the whole collection back to localStorage and stamps `updatedAt`.)*

### Screen layout
- [x] Top section: **Overview** (per below). *(Sub-phase 32h — block always visible; sticky-on-scroll is a future polish.)*
- [x] Middle section: **Sells** table (above) and **Buys** table (below). Sell-table is rendered above buy-table per the user's preference (selling first to fund buys reflects the typical mental flow). *(Sub-phase 32g)*
- [x] Each table has its own row-add control; row-add for buys opens a stock-picker modal (existing or SPEC-029-resolved tickers), row-add for sells opens a position-picker scoped to currently held positions across all investing accounts. *(Sub-phase 32g)*
- [x] Both tables use the shared `ConfigurableTable` component (Phase 27b) so the user can hide / reorder columns and the layout is persisted in localStorage per-table. *(Sub-phase 32h)*

### Sell rows — fields and columns
Always-visible columns (cannot be hidden):
- [x] **Include checkbox** — row participates in the calculation when checked. Unchecked rows remain in the scenario but do not affect totals. *(Sub-phase 32g — checkbox renders; calc-side consumer lands in 32h.)*
- [x] **Ticker** *(Sub-phase 32g — clickable navigation to Stock page lands in 32h.)*
- [x] **Investing account** — picker; shows only accounts that hold the stock; if multiple, defaults to the largest position. *(Sub-phase 32g)*
- [x] **Number of shares to sell** — user-editable; constrained to ≤ available shares on the picked account. *(Sub-phase 32g)*
- [x] **Available shares to sell** — read-only; sub-line shows "(N held > 365 days)" long-term-hold hint with explanatory tooltip. *(Sub-phase 32h item 381 — `longTermSharesCount` in planningCalc.)*

Toggleable columns (default-visible unless noted):
- [x] Company name. *(Sub-phase 32h)*
- [x] Stock exchange. *(Sub-phase 32h)*
- [x] Currency (trade currency). *(Sub-phase 32h)*
- [x] Currency rate vs main. *(Sub-phase 32h — uses live SPEC-027 cache; `~` indicator deferred — column header rate is the merged live + override value.)*
- [x] **Last price** (live latest price in trade currency). *(Sub-phase 32h)*
- [x] **Adjusted price** — `Last price` / `Round down to N` / `Round up to N` / `Manual`. Rule + decimals + manual value persisted on the row. *(Sub-phase 32h item 377)*
- [x] **Fee amount** — pre-filled from fee defaults; inline-editable per row with revert-to-default button when overridden. *(Sub-phase 32h item 378)*
- [x] **Fee % of trade** — derived: `fee / (shares × adjustedPrice) × 100`. *(Sub-phase 32h)*
- [x] **Last actual dividend %** — `lastRegularPerShare × frequencyMultiplier ÷ adjustedPrice` (Forward yield). *(Sub-phase 32h)*
- [x] **Last actual dividend amount per month gross** — `× shares ÷ 12`. *(Sub-phase 32h, default-hidden)*
- [x] **Last actual dividend amount per month net** — gross × (1 − resolved tax %). *(Sub-phase 32h)*
- [x] **Last year dividend %** (TTM) — `sumLast12MonthsPerShare ÷ adjustedPrice` × 100. *(Sub-phase 32h, default-hidden)*
- [x] **Last year dividend amount per month gross**. *(Sub-phase 32h, default-hidden)*
- [x] **Last year dividend amount per month net**. *(Sub-phase 32h, default-hidden)*
- [x] **Trade value (gross)** = `shares × adjustedPrice`. *(Sub-phase 32h)*
- [x] **Trade value (net of fee)** = `shares × adjustedPrice − fee`. *(Sub-phase 32h)*
- [x] **Trade value (main currency)** — converted via current FX. *(Sub-phase 32h, default-hidden)*
- [x] **Lot picker (Phase 36g).** Standalone "○ Lots" / "● Lots" action button on each planned sell row opens a `LotPickerModal` showing open lots for that account+ticker. Pre-fills from `row.lotAllocations` if previously saved, else FIFO-fills from `row.shares`, else zeros. Buttons: Cancel / Clear / FIFO fill / Save. On Save, persists `lotAllocations` to the row via `updateSellRow` and rewrites `row.shares` to the picked total. The Execute modal then opens with `showLots = true` and the saved picks pre-filled, so the user can review and execute without re-picking. Filled-state indicator (●) on the button shows when picks are saved.

### Buy rows — fields and columns
Always-visible columns (cannot be hidden):
- [x] **Include checkbox** — same semantics as sells. *(Sub-phase 32g)*
- [x] **Ticker** *(Sub-phase 32g — clickable navigation lands in 32h.)*
- [x] **Investing account** — picker; **all** investing accounts allowed (defaults to the user's most-recently-used account). *(Sub-phase 32g — last-used account stored at `rmoney_trading_scenarios_last_buy_account`.)*
- [x] **Number of shares to buy** — user-editable. *(Sub-phase 32g)*

Toggleable columns (default-visible unless noted):
- [x] Company name, stock exchange, currency, currency rate vs main, last price, adjusted price (same rule set as sell-side). *(Sub-phase 32h)*
- [x] **Fee amount** + **Fee %** (same as sell-side). *(Sub-phase 32h)*
- [x] **Last actual dividend %** / per-month gross / per-month net — buy's `adjustedPrice + fee/share` denominator. *(Sub-phase 32h item 378a)*
- [x] **Last year dividend %** (TTM) / per-month gross / per-month net — same pattern. *(Sub-phase 32h, default-hidden)*
- [x] **Buy price including fee per share** = `(shares × adjustedPrice + fee) ÷ shares`. *(Sub-phase 32h)*
- [x] **Trade value without fee** = `shares × adjustedPrice` (trade currency). *(Sub-phase 32h)*
- [x] **Trade value with fee** = `shares × adjustedPrice + fee`. *(Sub-phase 32h)*
- [x] **Trade value (main currency, with fee)** — toggleable. *(Sub-phase 32h, default-hidden)*

### Adjusted-price rule
- [x] Each row has an **adjusted-price control**: a small dropdown next to the price column with options `Last price` / `Round down to N` / `Round up to N` / `Manual`. Selecting `Round down`/`Round up` exposes a decimal-count input (default 2). Selecting `Manual` exposes a number input. *(Sub-phase 32h — `AdjustedPriceCell` component)*
- [x] Adjusted price drives every downstream calculation in the row (trade value, fee %, dividend %, cash impact). Stored on the row. *(Sub-phase 32h)*
- [x] The unadjusted last price is still shown in its column for reference. *(Sub-phase 32h)*

### Fee setup (canonical defaults in Settings → Investments → Trading fees)
- [x] New **Trading fees** card on Settings → Investments tab. *(Sub-phase 32f)*
- [x] Per stock-exchange defaults: `{ mic: MIC, currency: ISO, feePercent: number, minimumFee: number }`. Adding an exchange offers the canonical-MIC list (`CANONICAL_EXCHANGES`) from `marketDataExchanges.js`. *(Sub-phase 32f)*
- [x] Per-stock overrides: `{ ticker: string, feePercent: number, minimumFee: number, currency: ISO }` — references an existing `stockProfile`. *(Sub-phase 32f — adding/editing happens in Settings; clicking the fee column on a planning row to jump back here is part of Sub-phase 32h.)*
- [x] Resolution order at row creation: **per-stock override → per-exchange default → 0 (no fee)**. The applied fee is computed as `max(minimumFee, gross × feePercent / 100)` because `feePercent` is stored as the displayed percent value (e.g. `0.10` means 0.10 %). Exposed as `resolveTradingFee(ticker, exchange, gross)` from `data/settings.js`, returning `{ feeAmount, source }`. *(Sub-phase 32f)*
- [x] **Inline override on planning rows:** typing a number in the row's fee field overrides the resolved default for that row only — does NOT change saved defaults. A small dot indicator shows when a row's fee has been manually overridden; clicking the ↺ button reverts to the resolved default. *(Sub-phase 32h — `FeeCell` component)*
- [x] **Tooltip** on the Fee cell: "Defaults set in Settings → Investments → Trading fees. Edit per row to override for this scenario only." *(Sub-phase 32h — tooltip on the cell since column headers aren't tooltipped by ConfigurableTable)*
- [x] **Maximum fee per exchange / per stock (Phase 33).** Extend per-exchange and per-stock fee records with an optional `maximumFee: number | null` field (default null = no cap). Resolution becomes `clamp(gross × feePercent / 100, minimumFee, maximumFee ?? Infinity)`. The Settings → Investments → Trading fees card adds a "Max fee" input column next to "Min fee", with a small "—" placeholder when null. Validation: when both min and max are set, `max >= min` (else inline error). Useful for brokers that cap commission at a flat number regardless of trade size. *(Sub-phase 33l)*

### Overview block (above the sells table)
- [x] **Cash balances panel** showing every currency the user holds across all investing accounts, totalled. *(Sub-phase 32h)*
- [x] **Add to cash balances** field per currency. *(Sub-phase 32h — stored in `scenario.cashTopUps`)*
- [x] **Cash impact summary**: starts from "current totals + planning-only top-ups", applies sells (credits), then applies buys (debits) via the currency-exchange priority cascade. Shows Start / Top-up / Sells / Buys / Transfer in / Transfer out / End. *(Sub-phase 32h)*
- [x] **Currency-exchange priority** — implemented per spec in `simulateCashImpact()`. *(Sub-phase 32h item 380)*
- [x] **Editable FX rates panel** — every distinct trade-currency → main-currency pair pre-fills with the live SPEC-027 rate; overrides stored in `scenario.fxOverrides`. *(Sub-phase 32h item 379b)*
- [x] **Currency-display picker** — pill-list of every trade currency + main; defaults applied when the user has not made a selection yet. *(Sub-phase 32h item 379a)*
- [x] **Weighted-average dividend metrics** — sells row, buys row, Δ delta row; forward and TTM avg %, monthly gross and net in main currency. *(Sub-phase 32h — `computeDividendAggregates`)*

### Phase 33 — refresh + disregard-cash + overspend + table alignment

- [x] **"Refresh data" button in the page header** triggers `resetPageCaches('buy-sell-planning')` (SPEC-027 Phase 33) — refreshes latest prices for every ticker referenced by an included row, refreshes FX rates for the displayed currencies, refreshes the stock profile for any ticker whose latest mapping might be stale (most common need: the user just remapped a ticker on the Stock inventory page and wants the plan to pick up the new identity). Renders a "Refreshing…" spinner while in flight. Available as the page-level reset button at the right end of the action row. *(Sub-phase 33c item 405 — ships as the shared "Reset API" button)*
- [x] **"Disregard cash balance" toggle** in the Overview block, beside the cash-balances panel. When ON, the Start column of the cash-impact table is set to **zero per currency** and the per-currency top-up inputs become the only initial cash source. The cash-balances panel itself becomes muted (greyed) with a label "(ignored in this scenario)". The currency-exchange priority cascade still runs, but it cascades only against the top-up amounts (matching trade currency → main currency → other top-ups by descending value). The flag is persisted per scenario as `scenario.ignoreActualBalances: boolean`. *(Sub-phase 33l)*
- [x] **Overspend display in the cash impact table.** Currently `simulateCashImpact()` reports `shortfall` per currency when buys exceed available cash even after the cascade. Render this in a new column "Overspend" placed right of "End", per-currency. End remains clamped at ≥ 0 (matching the existing UI invariant) but Overspend shows the absolute shortfall. When `Overspend > 0` the row is tinted red. When `Overspend === 0` the cell shows "—". *(Sub-phase 33l)*
- [x] **Cash-impact and dividend-impact tables — column alignment fix.** Header cells render with the same `text-align` as their column's value cells. Currency code prefix lives in its own narrow column (right-aligned text) so numeric values line up by decimal across all rows. Start column always shows a value (or "0.00" when literal zero, never blank). Applied consistently to the cash-impact table (Start / Top-up / Sells / Buys / Transfer in / Transfer out / End / Overspend) and the dividend-impact table (Sells avg yield / amount / Buys avg yield / amount / Δ rows). *(Sub-phase 33l)*

### Execution + lifecycle
- [x] Each row carries an **Execute** action button. Clicking it opens a self-contained `ExecuteModal` pre-filled with the row's investing account (locked, read-only), ticker, shares, adjusted price, fee, and (for sells) a FIFO-pre-filled lot picker. The modal writes a real `createBuy` / `createSell` transaction using the same data functions as `InvestingAccountDetail.jsx`, then calls `markRowExecuted`. *(Sub-phase 32k — `ExecuteModal` component in `BuySellPlanning.jsx`; avoids modifying the 2490-line `InvestingAccountDetail.jsx`)*
- [x] On successful save the row is flagged `executedAt: ISO timestamp` and `executedTransactionId: string`. The Execute button is replaced by a "✓ Done" badge; the Include checkbox is forcibly off. If `removeExecutedRows` is set the row disappears. *(Sub-phase 32k)*
- [x] User can choose, per scenario, whether executed rows are removed automatically or kept for history. Default: kept. *(Sub-phase 32h — toggle on the scenario action bar; flag `scenario.removeExecutedRows`)*
- [x] Cancelling the Execute modal leaves the planned row untouched. *(Sub-phase 32k)*

### Persistence
- [x] Scenarios live in a new `tradingScenarios` collection in localStorage. Per-scenario shape stores: name, createdAt, updatedAt, sellRows[], buyRows[], cashTopUps{}, fxOverrides{}, displayedCurrencies[], removeExecutedRows: bool. *(Sub-phase 32g — `rmoney_trading_scenarios` plus `rmoney_trading_scenarios_active` and `rmoney_trading_scenarios_last_buy_account` for UI state.)*
- [x] Each row stores: ticker, exchange, currency, investingAccountId, shares, adjustedPriceRule, adjustedPriceValue (cached), manualFeeOverride, lotAllocations (sells only), included: bool, executedAt, executedTransactionId. *(Sub-phase 32g — `blankRow` matches the SPEC-034 shape; `adjustedPriceManual` and `adjustedPriceDecimals` are the cached values for the rules.)*
- [x] Settings → Investments → Trading fees stores the per-exchange and per-stock fee defaults as part of the existing `rmoney_settings` blob. *(Sub-phase 32f)*
- [x] **Storage tab card** added: "Buy-Sell Planning" card listing scenario count, total bytes, per-scenario breakdown (sell-row count, buy-row count, bytes) with bulk-clear action. *(Sub-phase 32h)*

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

Settings extension (`rmoney_settings.tradingFees`) — **`feePercent` is stored as the displayed percent value, not a multiplier**, so the math is `gross × feePercent / 100`:

```
{
  exchanges: [
    { mic: 'XLON', currency: 'GBP', feePercent: 0.10, minimumFee: 5.00, maximumFee: 25.00 },  // Phase 33: maximumFee optional
    { mic: 'XNAS', currency: 'USD', feePercent: 0.50, minimumFee: 1.00, maximumFee: null }    // null = uncapped
  ],
  stocks: [
    { ticker: 'BYG', currency: 'GBP', feePercent: 0.08, minimumFee: 4.00, maximumFee: 20.00 }
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
