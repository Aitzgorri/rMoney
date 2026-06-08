---
id: SPEC-036
name: Crypto holdings
status: in-progress
created: 2026-06-02
---

# Crypto holdings

## Goal
Let the user track **spot cryptocurrency holdings** alongside their stocks, reusing the
lot-based cost-basis, multi-currency/FX, and investment-reporting machinery already built
for equities. Buying, selling, swapping, or moving crypto between wallets should produce
accurate cost basis, realised/unrealised P/L, and portfolio weight — **without** the
dividend/coupon complexity stocks carry. Crypto is the first new asset class (Phase 20)
precisely because its transaction shapes map almost one-to-one onto the existing stock
model, so the guiding principle is **maximum reuse, minimum new machinery**.

## User Stories
- As a user, I can record a **spot purchase** of a coin (quantity, price, fee, currency, date) so that it appears as a lot with cost basis.
- As a user, I can **sell** part or all of a holding with FIFO/LIFO lot selection so that realised P/L is computed correctly.
- As a user, I can record a **swap** (e.g. BTC → ETH) so that the disposed coin realises P/L and the acquired coin opens a new lot at the swap-rate spot price.
- As a user, I can **transfer** a holding between my own wallets/accounts without triggering a realisation so that cost basis is preserved.
- As a user, I can see crypto holdings, current value, and P/L on the **existing inventory + reports** screens, priced from a live source.
- As a user, I can value crypto in my **main currency via FX** so it sits inside the overall portfolio total and weight.

## Acceptance Criteria

### Data model & asset-class tagging (D6)
- [x] Crypto records are stored in `rmoney_stock_transactions` with `assetClass:'crypto'`; records without the field are treated as `'stock'`. *(Read-side step 1 via `assetClassOf()`; write-side step 2 — `createBuy`/`createSell` stamp `assetClass:'crypto'` only for crypto, so stock records stay byte-identical.)*
- [x] `getStockTransactionsByTicker`, `getAllKnownTickers`, `hasOpenLotsForTicker`, and any other cross-asset query accept/apply an `assetClass` filter so stock and crypto holdings never mix in inventory, resolution, or reports. *(Step 1: added `ASSET_CLASS` + `assetClassOf()`; threaded an `assetClass` param defaulting to `STOCK` through `getStockTransactionsByTicker`, `getAllKnownTickers`, `hasOpenLotsForTicker`, `getOpenLots`, `getPositions`. Existing callers unchanged; crypto is opt-in.)*
- [x] A crypto buy/sell carries an optional `wallet` (label or address) field; it occupies the display slot `exchange` fills for stocks (D1). No new wallet entity exists. *(Step 2: `wallet` accepted by `createBuy`/`createSell`/`updateBuy`/`updateSell`, stored only on crypto records. The UI that renders it in the exchange slot is the entry-form step.)*

### Buy / Sell (reuses existing lot engine)
- [x] A crypto **buy** records `{ assetClass:'crypto', type:'buy', ticker, wallet?, date, quantity, price, currency, fee }` and opens a lot via the existing `getOpenLots` path; fractional quantities (e.g. 0.0123 BTC) are supported. *(Step 2: `createBuy({ assetClass:'crypto', wallet })`; `shares` flows unchanged so fractions work. Exercised by the entry-form step.)*
- [x] A crypto **sell** consumes lots by the existing FIFO/LIFO selection and realises P/L against cost basis exactly as stocks do; partial sells leave the remaining lots intact. *(Step 2: `createSell` now scopes its default FIFO allocation to `getOpenLots(..., assetClass)`, so a crypto sell only consumes crypto lots.)*
- [x] Buy debits / sell credits the correct investing-account cash balance in the trade currency, reusing the existing cash-movement path; FX to main currency reuses the existing snapshotting. *(Step 2: no change needed — `createBuy`/`createSell` already route through `addCashMovement` + `exchangeRates`; crypto reuses it as-is.)*

### Swap (dedicated `swap` type — D2)
- [x] A **swap** is one record `{ assetClass:'crypto', type:'swap', from:{ticker,quantity}, to:{ticker,quantity}, spotValue, currency, fee, wallet?, date }`. *(Step 3: `createSwap()` writes exactly this shape, plus `feeCurrency`/`feeCashBalanceId` and the FROM-leg `lotAllocations`.)*
- [x] The `from` leg realises P/L against the disposed coin's cost basis using the same lot-selection rule as a sell. *(Step 3 does the realisation: `createSwap` FIFO-allocates over the disposed coin's crypto lots and `getOpenLots` drops them, so the consumed cost basis is exact. Step-4 audit: the app surfaces **no** named "realised P/L" figure anywhere — stock sells don't either; gains are shown as unrealised position value vs avg cost. So the realisation is complete and consistent with stocks; there is no realised-P/L display to make swap-aware.)*
- [x] The `to` leg opens a new lot for the acquired coin at `spotValue` (its cost basis). *(Step 3: `getOpenLots` synthesizes a TO-leg lot `${swapId}:to` at `spotValue/toQuantity`, swap fee folded in. Chained swaps consume a prior TO-leg lot.)*
- [x] Net fiat cash impact of a swap is **zero** (no cash movement created beyond an optional fee). *(Step 3: `createSwap` emits no buy/sell movement; only a `swap-fee` debit when a fee + cash balance are given.)*
- [x] Every consumer handles `swap`: inventory quantities (both coins), realised-P/L totals, investment reports, and the cash-impact/Buy-Sell surfaces. *(Step-4 audit: **inventory quantities** correct via the swap-aware `getOpenLots`/`getPositions` (step 3). **Realised-P/L totals** — not a feature (see above). **Investment reports, portfolio history & Buy-Sell planning** all query `getPositions`/`getOpenLots` with the default `stock` class, so swaps (crypto) are neither shown nor able to corrupt stock numbers — they become visible only when crypto is surfaced, which is the reporting/display step (8). **Cash ledger** — the only swap artefact in an existing surface is the `swap-fee` cash movement; `InvestingAccountDetail` now labels it "Swap fee", makes it filterable, and keeps it out of `FEE_TYPES` so it renders standalone (it has no parent buy/sell row). No consumer mishandles a swap record.)*
- [ ] Editing or deleting a swap acts on the single atomic record (both legs together). *(Step 3: **deleting** done — `canDeleteStockTransaction` guards the TO-leg-consumed case and a buy whose lot a swap consumed; the generic delete removes the one record + its fee movement, restoring both legs. **Editing** needs the swap form, a later UI step.)*

### Transfer between wallets (dedicated `wallet-transfer` record — D3, coarse-label model)
- [x] A crypto **wallet transfer** records `{ assetClass:'crypto', type:'wallet-transfer', ticker, quantity, fromWallet, toWallet, date }`, preserves cost basis (holdings tracked per account+coin), and realises **no** P/L. *(Step 5: `createWalletTransfer` — audit/history record; no lot consumption, no cash movement.)*
- [x] Partial transfers are supported (any quantity may be recorded). *(Step 5: coarse model — the record carries the moved `quantity`; total per-coin holdings/basis are unchanged, so no per-lot wallet mutation. Per-wallet live balances deferred — see D3.)*
- [x] Crypto transfer is distinct from the existing stock inter-*account* transfer (which uses `destinationInvestingAccountId`); the crypto path uses a separate `type` and keys on wallet label. *(Step 5: distinct `type:'wallet-transfer'` — `getOpenLots`/`canDelete` have no branch for it, so it can't be misread as a consumer or inter-account transfer.)*

### Pricing (CoinGecko adapter — D5)
- [ ] A CoinGecko adapter is registered under the SPEC-027 market-data client, returning spot + historical prices; it is keyless in v1. *(Step 6: the adapter module `services/providers/coingecko.js` is built — keyless `getLatestPrice` + `getHistoricalSeries` priced in `config.vsCurrency`, other methods throw. **Client registration + the crypto-specific call path** (so crypto isn't tried against stock providers) is step 8 wiring.)*
- [x] `api.coingecko.com` is added to the static CSP `connect-src` in `tauri.conf.json` (SPEC-031); no URL or response is logged. *(Step 6. Keyless ⇒ no `secrets.js` record, no redaction-map entry, no `apiKeySet` flag. The adapter never logs; the client logs only the ticker.)*
- [x] A ticker→coin resolution step (SPEC-029) disambiguates symbols (e.g. `BTC → bitcoin`) before a price call. *(Step 7: `searchCryptoCoins(query)` (client) → `coingecko.searchCoins` returns ranked candidates `{coinId, symbol, name, marketCapRank}`; the adapter's `getLatestPrice`/`getHistoricalSeries` now accept `config.coinId` to price the chosen coin exactly. The user-facing pick + persisting the chosen `coinId` on the holding is the entry-form step, 2b.)*
- [x] Stablecoins resolve and price like any other coin (~1.00); no peg map exists (D4). *(Steps 6–7: `searchCryptoCoins` finds USDC/USDT like any coin and the adapter prices them identically — no peg map anywhere.)*

### Reporting & display
- [x] Crypto holdings appear in the existing investment inventory and Investment Reports surfaces, valued in main currency via FX, contributing to portfolio total and weight. *(8b: per-account Crypto holdings view. 8c: `gatherRawRows` includes `getPositions(acc,'crypto')` tagged `assetClass`; prices fetched via `getCryptoPrice` (keyed `assetClass:ticker`); `computeRows` values crypto, skips dividends/HQ, names via `cryptoProfiles`; crypto rows feed the report total + weights.)*
- [x] The investment-type filter in reports distinguishes crypto from stocks (reuses the Phase 20 placeholder slot). *(8c: the **Crypto** investment-type chip is now `live`; `displayRows` includes a row iff its `assetClass` is selected; new **By asset class** breakdown tab shows Stocks vs Crypto allocation. The portfolio-value-over-time chart (`portfolioHistory`) staying stock-only is a deferred refinement.)*

## UI / Screens
Entry reuses existing surfaces; display gets a dedicated crypto view (D7):
- **Transaction entry** (under the existing untyped investing accounts): the account buy/sell forms gain a **crypto mode** with a `wallet` field in place of `exchange`, fractional quantities, and the **coin picker** (D8: `searchCryptoCoins` candidates, top pre-selected → persist `coinId`). Plus new **Swap** and **wallet Transfer** actions. Any `<select>` listing investing accounts / categories follows the mandatory hierarchical + type-filtered dropdown rules (CLAUDE.md).
- **Crypto holdings view** (new, simple — D7): per-coin rows (coin, wallet, quantity, current value, P/L) for crypto positions; the stock Inventory table stays stock-only.
- **Investment Reports**: crypto positions roll into the aggregate total, weights, and allocation (by asset class), valued in main currency via FX.
- **Cash ledger**: the `swap-fee` movement is already labelled (step 4); swap and wallet-transfer rows in an account's history are formatted as part of the forms work.

## Data
- **Collection:** `rmoney_stock_transactions` (shared, D6). New/extended fields:
  - `assetClass: 'stock' | 'crypto'` (absent ⇒ `'stock'`).
  - `wallet?: string` (crypto label/address; the `exchange`-slot analogue).
  - `quantity` is used for crypto (fractional) in the role `shares` plays for stocks — reuse the existing field name where the engine already reads it, rather than adding a parallel field, to keep `getOpenLots` unchanged.
  - New `type` values: `'swap'` (with `from`/`to`/`spotValue`) and `'wallet-transfer'` (with `fromWallet`/`toWallet`, coarse-label audit record), both distinct from the existing inter-account `'transfer'`.
- **Read:** lot/cost-basis/P&L via the existing `getOpenLots` engine, now asset-class-aware. CoinGecko prices via the market-data client cache (responses only, never URLs/keys — SPEC-031).
- **Delete:** removing a swap/transfer record reverses its lot effects through the same recompute path as stock deletes.

## Out of Scope (v1)
- **Staking / yield rewards** — continuous-accrual income has no payout-date concept; deferred to a later spec.
- **On-chain transfer fee attribution** — network/gas fees on transfers are not modelled per-transaction in v1.
- **NFTs and crypto derivatives** (futures, perps, options) — not covered.
- **Tax-jurisdiction gain rules** specific to crypto — out of scope (general FIFO/LIFO realisation only).

## Design Decisions (resolved)
- **D1 — Wallet model: wallet is an _attribute_, not a new entity** (decided 2026-06-02). Crypto reuses the existing investing-account → holding structure unchanged; a holding carries an optional **wallet label/address** field occupying the slot that `exchange` fills for stocks. Maximum reuse, no new data layer. Consequence: there is no first-class "wallet" grouping entity; wallet is free text/address on the holding (and on transfer records). This shapes the answers to the transfer/swap questions below.
- **D2 — Swap is a _dedicated_ `swap` transaction type** (decided 2026-06-02). A swap is one atomic record holding both legs — `from {coin, qty}`, `to {coin, qty}`, swap-rate spot value, fee, date — rather than a linked sell+buy pair. Atomic to edit/delete; no fiat cash moves. **Cost (must be covered by acceptance criteria):** every consumer that iterates `stockTransactions` needs explicit `swap` handling — realised-P/L on the `from` leg (vs its lot cost basis), lot-open on the `to` leg at the spot value, inventory quantities, investment reports, the edit/delete form, and cash-impact (net fiat = 0). The `from` leg realises gain/loss against the disposed coin's cost basis using the same lot-selection (FIFO/LIFO) rule chosen for ordinary sells.
  - **Price-storage refinement (2026-06-08, from user feedback):** the swap record stores **both coins' market prices at swap time** — `from.price` and `to.price` (in `currency`). The user does **not** hand-enter a "trade value": the form **auto-fetches** both live prices (editable, so a backdated swap or a failed fetch can be corrected — last/edited value is kept), then **derives** `spotValue = fromQty × from.price` (the disposal value that drives realised P/L and the TO-leg cost basis). The form **displays** the implied swap rate (TO per 1 FROM from the entered quantities), the market rate (from the two prices), and the **swap P/L** = (toQty × to.price) − (fromQty × from.price) with %, so the user can see whether the swap was favourable vs market.
  - **Fee in crypto (2026-06-08, from user feedback):** a swap is coin-for-coin, so it creates **no fiat cash movement at all** (the earlier fiat `swap-fee` cash movement was removed). Any fee is a **crypto quantity** stored as `fee: { coin, quantity }`, defaulting to the **FROM** coin but selectable to **any held coin** (e.g. a network/gas coin). A fee paid in the FROM coin is folded into the FROM-leg disposal (`lotAllocations` cover `fromQty + feeQty`); a fee paid in a different coin consumes that coin's own lots via `feeLotAllocations`, which `getOpenLots` honours. The fee therefore reduces the fee-coin holding (a pure cost). **Consequence:** a swap has no cash leg. The account ledger was renamed **Asset movements** and now merges cash movements with crypto swaps + wallet-transfers (`getCryptoActivity`), with **Stocks / Crypto** one-click toggles to show/hide each asset class. Swap/move rows are informational ("no cash"), showing from→to coin/qty, implied rate, crypto fee, and the stored-price swap P/L, and can be **deleted** (guarded by `canDeleteStockTransaction`) or **edited** (edit-as-replace: the swap form opens pre-filled with the stored quantities/prices/fee and the FROM availability restored; saving deletes the original and creates the updated swap — only allowed when the swap is deletable).
- **D3 — Transfer is a _dedicated_ `wallet-transfer` record, coarse-label model** (decided 2026-06-02; model refined 2026-06-03 during step 5). Holdings, cost basis and P/L are tracked per **(account, coin)** and do **not** partition by wallet — consistent with D1 ("wallet is just a label, no grouping entity") and the "minimum new machinery" principle. A wallet transfer is therefore an **audit/history record** `{ type:'wallet-transfer', assetClass:'crypto', ticker, quantity, fromWallet, toWallet, date }` that records the movement; it **consumes no lots, creates no cash movement, and has no effect on computed quantities/basis/P&L** (no realisation). A **distinct `type` value** (not the inter-account `transfer`) keeps the lot engine from misreading it — `getOpenLots` has no branch matching `wallet-transfer`, so total holdings stay unchanged with no engine change. **Deferred to a later spec:** per-wallet live balances (the original "lots' wallet attribute changes" wording) and on-chain transfer-fee attribution (also in *Out of Scope* for v1).
- **D4 — Stablecoins are _regular priced coins_** (decided 2026-06-02). USDC/USDT/DAI etc. are ordinary holdings priced ~1.00 by the price source — no peg map, no cash-balance special-casing, no SPEC-018 cashMovements extension. A swap into a stablecoin yields a stablecoin holding (not fiat cash). Accepted minor consequence: peg wiggles show as small unrealised P/L, and a depeg is reflected at the quoted price like any other coin.
- **D5 — Price source: a new CoinGecko adapter** (decided 2026-06-02). No existing adapter (Finnhub/Stooq/Twelve Data as wired) fetches crypto, so live pricing is new work regardless. CoinGecko free API is crypto-native, keyless for basic use, and offers spot + historical with broad coin coverage. Registered as a SPEC-027 adapter; requires `api.coingecko.com` added to the static CSP `connect-src` (SPEC-031) and a ticker→coin resolution step (SPEC-029, e.g. `BTC → bitcoin`). Keyless in v1 → **no new `secrets.js` record**; if a Pro key is added later, follow the SPEC-031 `marketData/<id>/apiKey` rule.
- **D7 — Crypto display: a _dedicated_ crypto section + rollup into Investment Reports** (decided 2026-06-03). The existing Stock Inventory table is stock-specific (exchange, dividends, HQ country, ticker-resolution columns), so crypto is **not** forced into it. Instead a separate, simpler **Crypto holdings** view (coin, wallet, quantity, value, P/L) is added, and crypto also contributes to the aggregate **Investment Reports** totals/weights/allocation. Entry still reuses the account forms (untyped investing accounts hold both stocks and crypto).
- **D8 — Coin picker: always show ranked candidates, top pre-selected** (decided 2026-06-03). When the user types a symbol in the crypto entry form, `searchCryptoCoins` candidates are shown with the highest-market-cap coin pre-selected; the user confirms or changes it, and the chosen `coinId` is persisted. Safe against the frequent symbol collisions in crypto (tokens reusing tickers); costs one glance. No silent auto-pick.
- **D6 — Crypto shares the `rmoney_stock_transactions` collection, tagged `assetClass`** (decided 2026-06-02). Crypto records live in the existing collection with `assetClass:'crypto'`; legacy/stock records are treated as `assetClass:'stock'` when the field is absent. This reuses the lot engine (`getOpenLots`), cost-basis/FIFO-LIFO, P&L and reports directly rather than duplicating them. **Cost (must be covered by acceptance criteria):** every existing query that assumed a single asset class (`getStockTransactionsByTicker`, `getAllKnownTickers`, inventory, reports, ticker resolution) must filter by `assetClass` so stocks and coins never mix. Because no new collection is introduced, **no new Settings → Storage card** is required — but the existing stock-transactions Storage card breakdown should label the crypto vs stock split (see *Cross-spec impacts*).

## Open Questions
All resolved — see *Design Decisions*. (Carried originally from [SPEC-035 § Crypto](SPEC-035-asset-class-roadmap.md): wallet model → D1, swap → D2, transfer → D3, stablecoins → D4, price source → D5; collection structure resolved as D6.)

## Cross-spec impacts (do before marking done)
- **SPEC-027 (market data):** register the CoinGecko adapter (spot + historical, keyless v1).
- **SPEC-029 (resolution):** add a crypto ticker→coin disambiguation path.
- **SPEC-031 (security/CSP):** add `api.coingecko.com` to the static `connect-src` in `tauri.conf.json`; ensure no URL/key is logged or cached; if a Pro key is added, add a `marketData/coingecko/apiKey` record and the `…Set: bool` settings flag.
- **SPEC-024 (reports) / inventory:** make asset-class-aware; add crypto to the investment-type filter (Phase 20 placeholder slot).
- **SPEC-016 (backup/portability):** new transaction types + `assetClass`/`wallet` fields are a data-shape change — **evaluate bumping the backup format `rmoney-data-v4 → v5`** and update the RELEASE.md *Data compatibility* table. (No new collection, so no new redaction-map entry and no new Storage card — but relabel the existing stock-transactions Storage card breakdown to show the crypto/stock split.)
- **SPEC-035:** once this spec is `ready`, mark Crypto as graduated (SPEC-036) in the roadmap; update `specs/implementation-plan.md` Phase 20 (move item 222 from placeholder to in-progress).

## Status note
Spec drafted collaboratively 2026-06-02; all six design decisions resolved. Acceptance criteria above are the v1 contract. **Set to `ready` (then update the implementation plan) before any code is written** — per the spec-driven workflow.
