// Pure calculation helpers for Buy-Sell Planning (SPEC-034, Sub-phase 32h).
//
// Everything in this module is a pure function with no side effects so the
// callers can stay deterministic and testable. The planning screen feeds these
// helpers state it has already gathered (cash totals, FX rates, yield data) —
// they never read from localStorage or hit the network themselves.

const FREQ_MULTIPLIER = { monthly: 12, quarterly: 4, 'semi-annual': 2, annual: 1 }

// ─── Adjusted-price rule ────────────────────────────────────────────────────
//
// Each row has an `adjustedPriceRule`: 'last' | 'round-down' | 'round-up' | 'manual'.
// Returns the price that drives every downstream calc for that row, or null
// when the inputs are insufficient (e.g. live price missing on a 'last' rule).
export function applyAdjustedPriceRule(lastPrice, rule, decimals, manual) {
  if (rule === 'manual') {
    const n = Number(manual)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null
  if (rule === 'round-down') return roundTo(lastPrice, decimals, Math.floor)
  if (rule === 'round-up')   return roundTo(lastPrice, decimals, Math.ceil)
  // 'last' (default)
  return lastPrice
}

function roundTo(value, decimals, fn) {
  const d = Math.max(0, Math.min(12, Number(decimals) || 0))
  const m = Math.pow(10, d)
  return fn(value * m) / m
}

// ─── Row derived numbers ────────────────────────────────────────────────────
//
// Given a row plus its lookup data (live price, fee resolver, yield data, tax),
// returns every derived number the table columns need. Returns null fields when
// inputs are missing so the table can render "—" without throwing.

export function computeSellRowDerived(row, ctx) {
  const adjustedPrice = applyAdjustedPriceRule(
    ctx.lastPrice, row.adjustedPriceRule, row.adjustedPriceDecimals, row.adjustedPriceManual,
  )
  const shares = Number(row.shares) || 0
  const gross = adjustedPrice != null ? shares * adjustedPrice : null
  const feeAmount = resolveRowFee(row, ctx, gross)
  const feePct = (gross && gross > 0 && feeAmount != null) ? (feeAmount / gross) * 100 : null
  const netOfFee = (gross != null && feeAmount != null) ? gross - feeAmount : null
  const mainCurrencyValue = convertWithFx(netOfFee, ctx.tradingCurrency, ctx.mainCurrency, ctx.fxRates)

  // Sell-side yield denominator is the adjusted price (no fee added, per SPEC-034).
  const yieldDenom = adjustedPrice

  const dividend = computeDividendColumns(yieldDenom, shares, ctx)

  return { adjustedPrice, gross, feeAmount, feePct, netOfFee, mainCurrencyValue, dividend }
}

export function computeBuyRowDerived(row, ctx) {
  const adjustedPrice = applyAdjustedPriceRule(
    ctx.lastPrice, row.adjustedPriceRule, row.adjustedPriceDecimals, row.adjustedPriceManual,
  )
  const shares = Number(row.shares) || 0
  const gross = adjustedPrice != null ? shares * adjustedPrice : null
  const feeAmount = resolveRowFee(row, ctx, gross)
  const feePct = (gross && gross > 0 && feeAmount != null) ? (feeAmount / gross) * 100 : null
  const grossPlusFee = (gross != null && feeAmount != null) ? gross + feeAmount : null
  const pricePerShareIncFee = (grossPlusFee != null && shares > 0) ? grossPlusFee / shares : null
  const mainCurrencyValue = convertWithFx(grossPlusFee, ctx.tradingCurrency, ctx.mainCurrency, ctx.fxRates)

  // Buy-side yield denominator includes the fee per share (per SPEC-034 item 378a).
  const yieldDenom = pricePerShareIncFee

  const dividend = computeDividendColumns(yieldDenom, shares, ctx)

  return { adjustedPrice, gross, feeAmount, feePct, grossPlusFee, pricePerShareIncFee, mainCurrencyValue, dividend }
}

function resolveRowFee(row, ctx, gross) {
  if (row.manualFeeOverride != null && row.manualFeeOverride !== '') {
    const n = Number(row.manualFeeOverride)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  if (gross == null) return null
  // ctx.resolveFee(ticker, exchange, gross) → { feeAmount, source }
  const r = ctx.resolveFee?.(ctx.ticker, ctx.exchange, gross)
  return r?.feeAmount ?? 0
}

function computeDividendColumns(yieldDenom, shares, ctx) {
  const out = {
    ttmPct: null,   ttmMonthGross: null,   ttmMonthNet: null,
    fwdPct: null,   fwdMonthGross: null,   fwdMonthNet: null,
  }
  if (yieldDenom == null || yieldDenom <= 0 || shares < 0) return out

  const taxPct = Number(ctx.taxPct) || 0
  const taxMul = 1 - taxPct / 100

  // TTM: sum of regular per-share payouts in the trailing 12 months
  const ttmPerShare = Number(ctx.ttmPerShare) || 0
  if (ttmPerShare > 0) {
    out.ttmPct = (ttmPerShare / yieldDenom) * 100
    out.ttmMonthGross = (ttmPerShare * shares) / 12
    out.ttmMonthNet = out.ttmMonthGross * taxMul
  }

  // Forward: last regular payout × frequency multiplier
  const fwdPerShareLast = Number(ctx.forwardPerShare) || 0
  const freqMul = FREQ_MULTIPLIER[ctx.frequency] ?? 0
  if (fwdPerShareLast > 0 && freqMul > 0) {
    const annual = fwdPerShareLast * freqMul
    out.fwdPct = (annual / yieldDenom) * 100
    out.fwdMonthGross = (annual * shares) / 12
    out.fwdMonthNet = out.fwdMonthGross * taxMul
  }

  return out
}

// ─── FX conversion ──────────────────────────────────────────────────────────
//
// fxRates is a flat map { 'USD->EUR': 0.92, ... } produced by the screen from
// the user's overrides + the live SPEC-027 spot cache. When the pair is
// missing we return null so the caller can render "—".

export function convertWithFx(amount, fromCcy, toCcy, fxRates) {
  if (amount == null || !Number.isFinite(amount)) return null
  if (!fromCcy || !toCcy || fromCcy === toCcy) return amount
  const rate = lookupFxRate(fromCcy, toCcy, fxRates)
  if (rate == null) return null
  return amount * rate
}

export function lookupFxRate(fromCcy, toCcy, fxRates) {
  if (!fromCcy || !toCcy) return null
  if (fromCcy === toCcy) return 1
  const direct = fxRates?.[`${fromCcy}->${toCcy}`]
  if (Number.isFinite(direct) && direct > 0) return direct
  // Fallback to the inverse if only one direction was set
  const inverse = fxRates?.[`${toCcy}->${fromCcy}`]
  if (Number.isFinite(inverse) && inverse > 0) return 1 / inverse
  return null
}

// ─── Cash impact simulation ─────────────────────────────────────────────────
//
// SPEC-034 "Currency-exchange priority":
//   1. For each buy, debit from the cash balance in the same trade currency first.
//   2. Otherwise, debit from the main-currency balance (simulated FX leg).
//   3. Otherwise, debit from any other balance in descending order of available
//      value (converted to the trade currency).
//
// Sells always credit the balance in their trade currency (no FX leg).
//
// Inputs:
//   scenario       — the loaded scenario (with `sellRows`, `buyRows`, `cashTopUps`)
//   balancesByCurrency — { [ccy]: number } current totals across all investing accounts
//   fxRates        — { 'A->B': number, … }
//   mainCurrency   — string
//   derivedSellRows / derivedBuyRows — the row→derived maps already computed
//     ({ [rowId]: ReturnType<computeSellRowDerived> })
//
// Output:
//   perCurrency: {
//     [ccy]: { start, topUp, sells, buys, end, transferIn, transferOut },
//   }
//   shortfall: { [ccy]: number }  // amount the buy couldn't satisfy from any balance

export function simulateCashImpact({
  scenario,
  balancesByCurrency,
  fxRates,
  mainCurrency,
  derivedSellRows,
  derivedBuyRows,
}) {
  const ignoreBalances = !!scenario?.ignoreActualBalances
  const effectiveBalances = ignoreBalances ? {} : (balancesByCurrency ?? {})

  // FX resolution that triangulates through the main currency when no direct or
  // inverse pair exists. The FX panel only stores main↔foreign pairs, so a
  // cross pair such as GBP→USD is otherwise missing and the cascade silently
  // skips that balance. Routing GBP→EUR→USD lets the cascade tap every balance.
  // (SPEC-034 Phase 38 overspend fix.)
  function fxRate(from, to) {
    const direct = lookupFxRate(from, to, fxRates)
    if (direct != null) return direct
    if (mainCurrency && from !== mainCurrency && to !== mainCurrency) {
      const a = lookupFxRate(from, mainCurrency, fxRates)
      const b = lookupFxRate(mainCurrency, to, fxRates)
      if (a != null && b != null) return a * b
    }
    return null
  }
  function fxConvert(amount, from, to) {
    if (amount == null || !Number.isFinite(amount)) return null
    if (!from || !to || from === to) return amount
    const r = fxRate(from, to)
    return r == null ? null : amount * r
  }

  // Initialise the per-currency ledger with current balances + planning top-ups
  const ledger = {}
  function ensure(ccy) {
    if (!ledger[ccy]) {
      ledger[ccy] = {
        start: effectiveBalances[ccy] ?? 0,
        topUp: 0,
        sells: 0,
        buys: 0,
        transferIn: 0,
        transferOut: 0,
        end: 0,
      }
    }
    return ledger[ccy]
  }

  for (const ccy of Object.keys(effectiveBalances)) ensure(ccy)
  for (const [ccy, amount] of Object.entries(scenario.cashTopUps ?? {})) {
    const n = Number(amount)
    if (!Number.isFinite(n) || n === 0) continue
    const row = ensure(ccy)
    row.topUp += n
  }

  // Apply sells (credits to the trade-currency balance)
  for (const row of scenario.sellRows ?? []) {
    if (!row.included || row.executedAt) continue
    const d = derivedSellRows?.[row.id]
    const netOfFee = d?.netOfFee
    if (netOfFee == null) continue
    const ccy = row.currency || mainCurrency
    const l = ensure(ccy)
    l.sells += netOfFee
  }

  // Working ledger for buy debit decisions (must include topUp + sells already applied)
  function availableInCurrency(ccy) {
    const l = ledger[ccy]
    if (!l) return 0
    return l.start + l.topUp + l.sells + l.transferIn - l.buys - l.transferOut
  }

  const shortfall = {}
  // Buys priced in each currency, before any FX funding — drives the
  // standalone (own-cash) overspend column.
  const nativeBuys = {}

  // Collect the pending buy orders once so we can run the priority cascade as
  // GLOBAL passes instead of finishing one buy before starting the next.
  const orders = []
  for (const row of scenario.buyRows ?? []) {
    if (!row.included || row.executedAt) continue
    const d = derivedBuyRows?.[row.id]
    const need = d?.grossPlusFee
    if (need == null || need <= 0) continue
    const ccy = row.currency || mainCurrency
    const l = ensure(ccy)
    nativeBuys[ccy] = (nativeBuys[ccy] ?? 0) + need
    orders.push({ ccy, l, remaining: need })
  }

  // The cascade runs in priority order ACROSS ALL BUYS, not per-buy. If a buy
  // borrowed its main-currency FX leg before another buy in that same currency
  // had claimed its own cash, growing the native buy would wrongly grow the
  // borrowed leg instead of shrinking it. Three global passes fix that:
  //   Pass 1 — every buy debits its own trade-currency cash.
  //   Pass 2 — leftover shortfalls borrow the main currency (FX leg).
  //   Pass 3 — leftover shortfalls borrow any other balance, largest first.

  // Pass 1: same trade currency
  for (const o of orders) {
    const sameAvail = availableInCurrency(o.ccy)
    const take = Math.min(o.remaining, Math.max(0, sameAvail))
    o.l.buys += take
    o.remaining -= take
  }

  // Pass 2: main currency (with FX leg)
  for (const o of orders) {
    if (o.remaining <= 0 || !mainCurrency || o.ccy === mainCurrency) continue
    const mainAvailNative = availableInCurrency(mainCurrency)
    if (mainAvailNative <= 0) continue
    const fxFromMain = fxRate(mainCurrency, o.ccy)
    if (!fxFromMain || fxFromMain <= 0) continue
    const mainNeeded = o.remaining / fxFromMain
    const mainSpend = Math.min(mainNeeded, mainAvailNative)
    const mainL = ensure(mainCurrency)
    mainL.transferOut += mainSpend
    const tradeIn = mainSpend * fxFromMain
    o.l.transferIn += tradeIn
    o.l.buys += tradeIn
    o.remaining -= tradeIn
  }

  // Pass 3: other balances, descending by trade-ccy value
  for (const o of orders) {
    if (o.remaining <= 0) continue
    const candidates = Object.keys(ledger)
      .filter(c => c !== o.ccy && c !== mainCurrency)
      .map(c => ({ ccy: c, avail: availableInCurrency(c) }))
      .filter(x => x.avail > 0)
      .map(x => ({ ...x, valueInTrade: fxConvert(x.avail, x.ccy, o.ccy) ?? 0 }))
      .sort((a, b) => b.valueInTrade - a.valueInTrade)
    for (const c of candidates) {
      if (o.remaining <= 0) break
      const fxOtherToTrade = fxRate(c.ccy, o.ccy)
      if (!fxOtherToTrade || fxOtherToTrade <= 0) continue
      const otherNeeded = o.remaining / fxOtherToTrade
      const otherSpend = Math.min(otherNeeded, c.avail)
      const otherL = ensure(c.ccy)
      otherL.transferOut += otherSpend
      const tradeIn = otherSpend * fxOtherToTrade
      o.l.transferIn += tradeIn
      o.l.buys += tradeIn
      o.remaining -= tradeIn
    }
  }

  for (const o of orders) {
    if (o.remaining > 0.01) shortfall[o.ccy] = (shortfall[o.ccy] ?? 0) + o.remaining
  }

  // Finalise `end` per currency
  for (const ccy of Object.keys(ledger)) {
    const l = ledger[ccy]
    l.end = l.start + l.topUp + l.sells + l.transferIn - l.buys - l.transferOut
  }

  // Standalone (own-cash) overspend: per currency, that currency's own buys
  // versus its own cash (start + top-up + sells), with NO cross-currency
  // funding. This is the intuitive "did this currency's orders fit its cash"
  // check and is independent of the FX cascade.
  const standaloneOverspend = {}
  for (const ccy of Object.keys(ledger)) {
    const l = ledger[ccy]
    const ownAvail = l.start + l.topUp + l.sells
    const over = (nativeBuys[ccy] ?? 0) - ownAvail
    if (over > 0.01) standaloneOverspend[ccy] = over
  }

  // FX-funded overspend: the residual the cascade could not fund from ANY
  // balance, consolidated into the main currency. Because the triangulated
  // cascade can reach every balance, a residual only survives once all
  // balances are exhausted — so a single main-currency figure is the right
  // representation.
  let fxOverspendMain = 0
  for (const [ccy, amt] of Object.entries(shortfall)) {
    const inMain = fxConvert(amt, ccy, mainCurrency)
    fxOverspendMain += inMain != null ? inMain : amt
  }

  return { perCurrency: ledger, shortfall, standaloneOverspend, fxOverspendMain }
}

// ─── Aggregate dividend metrics ─────────────────────────────────────────────
//
// Weighted-average yields + monthly amounts across the included rows.
// Weighting is by trade-value-in-main-currency so cross-currency rows contribute
// in their actual main-currency footprint.

export function computeDividendAggregates({ rows, derived, mainCurrency, fxRates, side }) {
  let weightSum = 0
  let weightedFwdPct = 0
  let weightedTtmPct = 0
  let monthGross = 0
  let monthNet = 0
  // Degraded-mode flags: when a row's trade currency has no FX rate to the main
  // currency we can't convert it, so the weighting falls back to the native
  // trade value (yield % still counts, flagged approximate) and the main-currency
  // monthly amounts are left out (flagged incomplete). Without this a dividend-
  // paying row in an unrated currency was silently dropped, zeroing the aggregate
  // even though its per-row yield columns showed fine. (SPEC-034 Phase 38.)
  let approxWeight = false
  let amountsMissingFx = false
  const missingFxPairs = new Set()
  for (const row of rows) {
    if (!row.included || row.executedAt) continue
    const d = derived[row.id]
    if (!d?.dividend) continue
    // Weight by trade-value-in-main-currency when available; otherwise fall back
    // to the row's native trade value so the row still contributes its yield %.
    const nativeVal = (side === 'sell' ? d.netOfFee : d.grossPlusFee) ?? 0
    let weight = d.mainCurrencyValue
    if (weight == null) {
      if (nativeVal <= 0) continue
      weight = nativeVal
      approxWeight = true
      if (row.currency && row.currency !== mainCurrency) missingFxPairs.add(`${row.currency}->${mainCurrency}`)
    }
    if (weight <= 0) continue
    weightSum += weight
    if (d.dividend.fwdPct != null) weightedFwdPct += d.dividend.fwdPct * weight
    if (d.dividend.ttmPct != null) weightedTtmPct += d.dividend.ttmPct * weight

    const fwdMonthGrossMain = convertWithFx(d.dividend.fwdMonthGross, row.currency, mainCurrency, fxRates)
    const fwdMonthNetMain   = convertWithFx(d.dividend.fwdMonthNet,   row.currency, mainCurrency, fxRates)
    if (fwdMonthGrossMain != null) monthGross += fwdMonthGrossMain
    else if ((d.dividend.fwdMonthGross ?? 0) > 0) amountsMissingFx = true
    if (fwdMonthNetMain != null) monthNet += fwdMonthNetMain
    else if ((d.dividend.fwdMonthNet ?? 0) > 0) amountsMissingFx = true
  }
  const avgFwdPct = weightSum > 0 ? weightedFwdPct / weightSum : null
  const avgTtmPct = weightSum > 0 ? weightedTtmPct / weightSum : null
  return {
    avgFwdPct, avgTtmPct, monthGross, monthNet, weightSum,
    approxWeight, amountsMissingFx, missingFxPairs: [...missingFxPairs],
  }
}

// ─── Long-term hold count (sell rows) ──────────────────────────────────────
//
// Returns how many shares of the row's open lots were acquired more than 365
// days ago. The hint is informational — tax treatment depends on jurisdiction.

export function longTermSharesCount(openLots, today = new Date()) {
  const cutoff = new Date(today)
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return (openLots ?? [])
    .filter(l => l.date && l.date <= cutoffStr)
    .reduce((s, l) => s + l.remainingShares, 0)
}
