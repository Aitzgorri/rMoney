---
id: SPEC-035
name: Asset class roadmap
status: draft
created: 2026-05-26
---

# Asset class roadmap

## Goal
The project goal commits to supporting six investment asset classes — **stocks, options, bonds, crypto, precious metals (storage), precious metals (lease)**. Today only stocks are implemented end-to-end (SPEC-018 through SPEC-034); the other five are placeholder slots in the Investment Reports type filter (SPEC-024). This document is a **roadmap sketch**, not a buildable spec: it names each asset class, lists the open design questions per type, and notes which one should come first. Each asset class will get its own full SPEC round before implementation.

## User Stories
- As a user, I can see at a glance which non-stock asset classes are planned and what state they're in, so I can decide whether to defer a real-money decision (e.g. opening a bond position) until the app supports it natively.
- As a contributor / future Claude session, I can read this document and understand the design space for any of the deferred asset classes without re-deriving it from the project goal.

## Acceptance Criteria

This spec is a **draft index**, not buildable. It is a parking lot for design questions and a suggested build order, not work the implementation plan tracks. It is considered complete only when every asset class it lists has its own full spec (`SPEC-036+`); at that point this file gets reduced to one-line pointers per class.

- [x] One subsection per asset class with: scope, open questions, dependencies, suggested first-spec milestone — already populated below.
- [x] Maintenance rule: when any asset class graduates to a full spec (`SPEC-036+`), remove its subsection here and replace with a one-line pointer to that spec.

## Suggested build order

Recommended sequence based on (a) similarity to the stock model — leveraging the most existing infrastructure, (b) likely user demand for a personal-finance app, and (c) data-source feasibility on the existing market data chain:

1. **Crypto** — closest to stocks (price series, lots, no dividend complexity). Reuses cashMovements, FX snapshotting, configurable column table. Wallet addresses replace stock exchanges; otherwise the transaction shapes map cleanly.
2. **Bonds** — adds coupon (=~ dividend) + maturity + accrued interest. Reuses the dividend infrastructure once the v0.34.0 status model lands. Coupon dates fit the same Dividend page calendar.
3. **Precious metals (storage)** — physical inventory model: quantity, weight unit, purity, optional storage cost. No yield. Simplest to implement but lowest priority because it's a small slice of typical portfolios.
4. **Precious metals (lease)** — adds counterparty, lease rate, payout cadence, principal return date. Effectively a niche fixed-income product; depends on bonds being modelled first to share the cadence machinery.
5. **Options** — most complex (strike, expiry, exercise/assignment lifecycle, optional greeks tracking). Substantially different data model from stocks. Last to ship; deserves its own design round.

---

## Crypto

**Scope:** spot holdings on user-managed or custodial wallets. Lots, cost basis, FIFO/LIFO sell selection, multi-currency.

**Open questions:**
- Wallet model: does an "investing account" become a wallet (one-to-one), or do wallets sit under an investing account (multi-wallet brokers like Coinbase)?
- On-chain transfers between user-owned wallets: like SPEC-019 transfer between investing accounts (cost basis preserved, no realisation), or like a withdrawal + deposit?
- Staking rewards: dividend-shaped income with no payout date concept (continuous accrual)?
- Cost basis on swaps (e.g. BTC → ETH): treat as sell-of-A + buy-of-B at the swap-rate spot, or model as a fifth stockTransactions-style type?
- Stablecoins: treat as a cash balance (USDC = USD-pegged) or as a separate ticker?
- Price source: CoinGecko free API is the obvious candidate; would need a SPEC-027 adapter slot.

**Dependencies:** SPEC-027 (new adapter for a crypto price provider), SPEC-018 (extend cashMovements if staking rewards land in stablecoin), SPEC-029 (resolution flow for ticker → coin disambiguation).

**Suggested first spec:** **SPEC-036 Crypto holdings** — covers spot buy/sell/transfer/swap + lots, leaves staking rewards + on-chain transfer attribution out of scope for v1.

---

## Bonds

**Scope:** corporate / government / municipal bonds with coupon, yield-to-maturity, maturity date, accrued interest, optional amortisation.

**Open questions:**
- Pricing: bond prices are typically quoted as a percentage of face value (e.g. 102.5 = 102.5% of par). Apply the same minor-unit normalisation as GBp / ZAc? Or keep as the percent and store the face value separately?
- Coupon model: reuse the SPEC-020 dividend mechanism (regular, predictable, per-instrument cadence) with `type: 'coupon'` discriminator? Most fields map naturally.
- Yield-to-maturity: a derived metric that requires price + coupon + maturity + frequency. Computable per-bond at read time.
- Maturity event: at maturity the face value returns to cash and the position closes. A new `stockTransactions.type: 'maturity'` record (analogous to split / transfer)? Or auto-generated on the maturity date?
- Accrued interest: between coupons, the bond's "dirty price" includes accrued interest. Display-time calc or stored?

**Dependencies:** SPEC-020 dividend status model (v0.34.0) — coupons reuse the same machinery once the receive / pending pipeline lands. SPEC-027 (no existing free-tier bond data; users may need manual entry only).

**Suggested first spec:** **SPEC-037 Bonds — fixed coupon** — covers purchases + coupon receipts + maturity, leaves callable / convertible / floating-rate out of scope for v1.

---

## Precious metals — storage

**Scope:** physical metals (gold, silver, platinum, palladium) held in physical form: home safe, allocated storage, vaulted storage. No counterparty, no yield.

**Open questions:**
- Quantity unit: troy ounces (most common) or grams? Both? User pick at the inventory level.
- Purity: 999.9 fine vs. coin-grade alloy (e.g. 22-karat Sovereigns). Affects "pure metal content" calc.
- Storage cost: monthly / annual fee, deducted from a cash balance per cadence. Reuse the recurring-transaction engine.
- Price source: London Bullion Market Association (LBMA) AM/PM fix is the reference, but no free API. Live spot via a generic precious-metals API (e.g. metals-api.com) is feasible.
- Form (bar / coin / round): track for inventory + insurance purposes, or skip in v1?

**Dependencies:** None hard; reuses cashMovements, FX, lots. Independent of all other asset classes.

**Suggested first spec:** **SPEC-038 Precious metals — storage** — pure inventory model with manual price entry + optional API spot price.

---

## Precious metals — lease

**Scope:** metals leased to a counterparty (jewelers, refiners, exchanges) that pay a lease rate (typically annualised) and return principal on a specified date.

**Open questions:**
- Counterparty model: a new entity type? Reuse "investing account" with a flag? Just a free-text field?
- Lease rate cadence: monthly / quarterly / annual payouts. Reuse the dividend / coupon pipeline.
- Principal return: similar to bond maturity — auto-generated event on the return date.
- Default / counterparty risk: not modelled in v1.

**Dependencies:** SPEC-037 Bonds (coupon / maturity machinery extracts the shared pattern), SPEC-038 Precious metals storage (inventory baseline).

**Suggested first spec:** **SPEC-039 Precious metals — lease** — single-counterparty leases with fixed rate, lump-sum principal return.

---

## Options

**Scope:** equity options (calls + puts), American + European exercise styles, with strike / expiry / underlying / premium tracking + exercise / assignment lifecycle.

**Open questions:**
- Greeks tracking: delta / gamma / vega / theta / rho. Display-time calc (Black-Scholes from current underlying + IV) or stored snapshots?
- IV source: free options data is scarce; Yahoo provides delayed IV per chain. Tradeoff between accuracy and provider cost.
- Multi-leg strategies (spreads, straddles, iron condors): are they composite records or N independent records with a strategy tag?
- Assignment / exercise events: write a stock buy/sell at the strike + close the option record? Or a new `'exercise'` / `'assignment'` event?
- Cash-settled vs. physically-settled differs in cash impact (cash credit only vs. cash + share movement).
- Margin requirements: track or ignore in v1?

**Dependencies:** SPEC-019 Stock transactions (exercised options write a buy/sell into the stock ledger), SPEC-027 (options data provider — likely paid tier).

**Suggested first spec:** **SPEC-040 Options — single-leg** — long-call / long-put / short-call / short-put with manual entry, simple exercise = generate buy/sell. Defers strategies and greeks.

---

## Cross-cutting design considerations

Two questions recur across every asset class and deserve a one-time resolution before SPEC-036 lands:

1. **Position-level discriminator.** Today every record in `stockTransactions` is implicitly a stock event. When other asset classes land, do we:
   - (a) Continue separate collections (`bondTransactions`, `cryptoTransactions`, …) with parallel CRUD?
   - (b) Add a top-level `assetClass` field on every existing transaction collection and a unified `assetTransactions` collection going forward?
   - (c) Hybrid — keep stocks where they are (lowest-risk for the existing 32k-LOC codebase), introduce new collections per class?

   Recommendation in this draft: **(c) hybrid**. Migration cost of unifying existing stock collections far outweighs the read-side benefit.

2. **Reports filter integration.** Reports (SPEC-024) already has a type filter with placeholders for all five non-stock classes. Each new spec needs to wire its records into the position table, the breakdown tabs (currency / region / portfolio), and the saved-preset shape. Schema reuse where possible; document any per-type quirks (e.g. options don't have a meaningful "MV in trading currency" once expired).

## Data

This is a draft index — no new collections, no schema changes. Each underlying spec defines its own data model.

## Out of Scope

- Tax-jurisdiction modelling per asset class (capital gains rules for crypto vs. metals vs. options differ wildly).
- Margin / leverage tracking.
- Securities lending (separate from precious-metals lease — equity-side stock-lending income).
- Forex as an investable asset class (today it's only an FX-conversion utility; users wanting forex carry would need bond / future modelling later).

## Open Questions

- Build order — does the user agree with crypto → bonds → metals-storage → metals-lease → options, or is there a real-money holding pushing one of them forward?
- Discriminator question (cross-cutting #1 above) — wait for SPEC-036 to force the decision, or resolve now?
- Are there any asset classes outside the project goal's list of six that should be added (e.g. real estate, P2P lending, private equity)?
