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
- [x] **Currency-exchange priority** — implemented per spec in `simulateCashImpact()`. *(Sub-phase 32h item 380)* *(Phase 38 verified that the existing sells-before-buys ordering already nets sells against buy FX legs — no change needed; see the Phase 38 section.)*
- [x] **Editable FX rates panel** — every distinct trade-currency → main-currency pair pre-fills with the live SPEC-027 rate; overrides stored in `scenario.fxOverrides`. *(Sub-phase 32h item 379b)*
- [x] **Currency-display picker** — pill-list of every trade currency + every held-balance currency + main; defaults applied when the user has not made a selection yet. A currency the user holds cash in but is not trading (e.g. a GBP balance with no GBP order) still appears in the picker and the default cash-impact table, because it participates in the FX cascade. *(Sub-phase 32h item 379a; held-balance inclusion added Phase 38)*
- [x] **Weighted-average dividend metrics** — sells row, buys row, Δ delta row; forward and TTM avg %, monthly gross and net in main currency. *(Sub-phase 32h — `computeDividendAggregates`)*

### Phase 33 — refresh + disregard-cash + overspend + table alignment

- [x] **"Refresh data" button in the page header** triggers `resetPageCaches('buy-sell-planning')` (SPEC-027 Phase 33) — refreshes latest prices for every ticker referenced by an included row, refreshes FX rates for the displayed currencies, refreshes the stock profile for any ticker whose latest mapping might be stale (most common need: the user just remapped a ticker on the Stock inventory page and wants the plan to pick up the new identity). Renders a "Refreshing…" spinner while in flight. Available as the page-level reset button at the right end of the action row. *(Sub-phase 33c item 405 — ships as the shared "Reset API" button)*
- [x] **"Disregard cash balance" toggle** in the Overview block, beside the cash-balances panel. When ON, the Start column of the cash-impact table is set to **zero per currency** and the per-currency top-up inputs become the only initial cash source. The cash-balances panel itself becomes muted (greyed) with a label "(ignored in this scenario)". The currency-exchange priority cascade still runs, but it cascades only against the top-up amounts (matching trade currency → main currency → other top-ups by descending value). The flag is persisted per scenario as `scenario.ignoreActualBalances: boolean`. *(Sub-phase 33l)*
- [x] **Overspend display in the cash impact table.** Currently `simulateCashImpact()` reports `shortfall` per currency when buys exceed available cash even after the cascade. Render this in a new column "Overspend" placed right of "End", per-currency. End remains clamped at ≥ 0 (matching the existing UI invariant) but Overspend shows the absolute shortfall. When `Overspend > 0` the row is tinted red. When `Overspend === 0` the cell shows "—". *(Sub-phase 33l)* **✓ Superseded by Phase 38 (two-column overspend model) below — the single `shortfall`-based column was both polluted by cross-currency borrowing and could not tap balances with no direct FX pair. See "Two-column overspend".**
- [x] **Cash-impact and dividend-impact tables — column alignment fix.** Header cells render with the same `text-align` as their column's value cells. Currency code prefix lives in its own narrow column (right-aligned text) so numeric values line up by decimal across all rows. Start column always shows a value (or "0.00" when literal zero, never blank). Applied consistently to the cash-impact table (Start / Top-up / Sells / Buys / Transfer in / Transfer out / End / Overspend) and the dividend-impact table (Sells avg yield / amount / Buys avg yield / amount / Δ rows). *(Sub-phase 33l)* **✓ The 33l CSS had a specificity bug that left headers left-aligned; fixed in Phase 38 (item 432).**

### Phase 38 — June 2026 adjustments

- [x] **Cash-impact / dividend-impact header alignment — CSS specificity bug fix.** The Phase 33l criterion above is correct in *intent* but the shipped CSS does not achieve it. In [`BuySellPlanning.module.css`](../../app/src/screens/BuySellPlanning.module.css), the rule `.impactTable th { text-align: left }` (selector specificity 0,1,1) **overrides** the `.tdRight` class (specificity 0,1,0) applied to each numeric header cell, so the headers (Start / Top up / Sells / Buys / Transfer in / Transfer out / End / Overspend, plus the dividend-impact yield/amount headers) render **left-aligned** while their values render right-aligned — the header label does not sit visually above the column it names. Fix: make the right-align win for header cells — either `.impactTable th.tdRight { text-align: right }` (raise specificity), or drop the blanket `text-align: left` on `.impactTable th` and apply left-align only to the label / empty currency-code header cell. The currency-code column header (`.ccyCol`, already `text-align: right`) is unchanged. No data or layout change beyond the header `text-align`.
- [x] **Cross-currency FX triangulation in the cash cascade.** The FX panel only stores `main↔foreign` pairs, so a cross pair such as `GBP→USD` was missing from `fxRatesEffective`. The buy cascade's priority-3 step (`other balances`) called `lookupFxRate(other, trade)` directly, got `null`, and silently `continue`d — meaning a balance in a currency with no direct pair to the trade currency (e.g. a GBP balance against a USD buy when EUR is main) was **never tapped and never listed as impacted**. Fix: `simulateCashImpact()` now resolves cascade rates through a local `fxRate(from, to)` helper that falls back to triangulating via the main currency (`from→main` × `main→to`) when no direct/inverse pair exists. With this, every balance is reachable from any trade currency, so GBP correctly shows a `Transfer out` and contributes to funding. Pure-function helpers only; the FX-panel display is unchanged. *(Phase 38)*

- [x] **Two-column overspend model.** The single `shortfall`-based "Overspend" column conflated two different questions and was reported in whichever trade currency the cascade happened to exhaust last (e.g. a EUR buy borrowing from the USD balance pushed a EUR deficit into the USD overspend figure). Replaced with **two** columns, both right of "End":
  - **Overspend (own cash)** — per currency, that currency's own buys minus its own cash (`start + top-up + sells`), with **no** cross-currency funding. Answers "did this currency's orders fit its own cash?" `simulateCashImpact()` returns this as `standaloneOverspend: { [ccy]: number }`. Example (buy 10 VNA @ €21.38 + 5 CALM @ $75; cash €150/$200/£50; main EUR): EUR €63.80, USD $175.00.
  - **Overspend (after FX, {main})** — the residual the triangulated cascade could **not** fund from any balance, consolidated into the **main** currency and shown only on the main-currency row. Because the triangulated cascade can reach every balance, a residual survives only once **all** balances are exhausted, so a single main-currency figure is the correct representation. `simulateCashImpact()` returns this as `fxOverspendMain: number`. Example (same scenario): €153.58 on the EUR row, with GBP fully spent (`Transfer out £50`).

  Both cells tint red when `> 0` and show "—" otherwise. Column headers carry `title` tooltips explaining the own-cash vs. after-FX distinction. *(Phase 38)*

- [x] **Cascade runs as global priority passes, not per-buy.** The cascade previously finished one buy's full trade→main→others sequence before starting the next. That let an early buy borrow another currency as its **main**-currency FX leg (priority 2) *before* a later buy denominated in that currency had claimed its own cash (priority 1) — so growing the native buy grew the borrowed leg instead of shrinking it, and the lending currency's `Transfer out` was pinned regardless of the native buy's size. Fixed by running the cascade in **three global passes** in `simulateCashImpact()`: (1) every buy debits its own trade-currency cash, (2) leftover shortfalls borrow the main currency, (3) leftover shortfalls borrow other balances (largest first). This makes a priority-1 native claim always beat another buy's priority-2 main-currency claim. Result for the reported case (EUR buy VNA + USD buys, EUR main, GBP balance): increasing VNA's shares now **decreases** EUR `Transfer out` and **increases** GBP `Transfer out`, and the EUR row no longer shows a spurious `Transfer in`. The documented trade→main→others priority is unchanged. *(Phase 38)*

- [x] **Dividend-impact aggregate robust to missing FX.** `computeDividendAggregates()` weighted each row by its trade value **in the main currency**; when the trade currency had no FX rate to main (e.g. a USD buy with EUR main and no `USD→EUR` rate cached or overridden), the conversion returned `null`, the row was silently **dropped** (`tradeValMain <= 0 → continue`), and the buys/sells aggregate showed `0.00%` / `0.00` — even though the per-row yield columns (which need no FX) displayed fine. Now: a row whose main-currency trade value is unavailable still contributes its yield % to the weighted average using its **native trade value** as the fallback weight (flagged `approxWeight`), and the main-currency monthly amounts omit the unconvertible rows (flagged `amountsMissingFx`, with the offending pairs in `missingFxPairs`). The dividend-impact table renders a `~` prefix on approximate yields, a `*` marker + tooltip on partial amounts, and a footnote naming the missing pair(s) and pointing to the FX-rates panel. Setting the rate (manually or via Refresh) completes the totals exactly. *(Phase 38)*

- [x] **Dividend-impact Δ row shows the TTM-yield difference.** The Δ Difference (buys − sells) row previously left the **Avg TTM yield** cell blank — only the forward-yield delta was shown. It now renders `buys.avgTtmPct − sells.avgTtmPct` (with the same `~` approximate marker when weighting fell back to native trade value), matching the forward-yield delta cell. *(Phase 38)*

- [x] **Overspend columns show the currency code inline.** Both overspend columns append the currency after the value — "own cash" in the row's trade currency (e.g. `171.47 USD`) and "after FX" in the main currency (e.g. `2.81 EUR`) — so the figure is unambiguous without reading back to the row's currency-code column. *(Phase 38)*

- [x] **Narrower Fee column in the row tables.** The Fee amount input is constrained to ~62 px (enough for ~3 decimals, e.g. `1.012`) via a dedicated `.feeInput` width, and the Fee column `minWidth` drops from 120 → 96, keeping the override dot + revert button visible. Applies to both the Sells and Buys tables (shared `FeeCell`). *(Phase 38)*

- [x] **End column sub-cent zero snap.** A balance that nets to exactly zero could render as a red "-0.00" due to floating-point noise in the transfer legs. The cash-impact table now snaps `|end| < 0.005` to `0` for both the displayed value and the negative/red flag, so a zeroed balance shows a plain "0.00" in the positive style. *(Phase 38)*

- [x] **Sells net against buy-driven FX legs — already satisfied by the sells-before-buys ordering (verified Phase 38, no code change).** The requested behaviour ("repay the FX borrow first") is already produced by the existing `simulateCashImpact()` ([`planningCalc.js`](../../app/src/utils/planningCalc.js)): it applies every included sell as a credit to its trade-currency balance **before** running the buy cascade, and the cascade's `availableInCurrency()` **includes those sell credits** — so a buy in a currency a sell also feeds only FX-borrows the *shortfall* after the sell, and the tapped currency is restored rather than left fully borrowed. Verified by isolating the pure function against the note's worked example (GBP £0 + EUR €1000, buy £500, sell £400, 1 EUR = 0.85 GBP): result **GBP end £0**, **EUR transfers out only €117.65 (end €882.35)** — not the full ~€588 — i.e. the £400 sell "repaid" all but ~€118 of the borrow, exactly the desired outcome. The reversibility the note mentions ("decreasing number of stocks") is likewise automatic: the simulation recomputes from scratch on every edit and always fills trade-currency cash before borrowing, so lowering a buy's share count shrinks the borrowed-from-other-currency leg first. **Known nuance (explicitly out of scope unless requested):** when a buy needs funding *beyond* its own trade currency, the cascade borrows from the **main** currency (priority 2) before tapping a sell-credited **other** currency (priority 3); making sells in any currency be consumed before new main-currency FX legs would change the documented trade→main→others priority and is deferred.

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
