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

  // Apply buys (debits, with FX cascade if the trade-currency balance is insufficient)
  for (const row of scenario.buyRows ?? []) {
    if (!row.included || row.executedAt) continue
    const d = derivedBuyRows?.[row.id]
    const need = d?.grossPlusFee
    if (need == null || need <= 0) continue
    const ccy = row.currency || mainCurrency
    const l = ensure(ccy)

    let remaining = need

    // Priority 1: same trade currency
    const sameAvail = availableInCurrency(ccy)
    const sameTake = Math.min(remaining, Math.max(0, sameAvail))
    l.buys += sameTake
    remaining -= sameTake

    // Priority 2: main currency (with FX leg)
    if (remaining > 0 && mainCurrency && ccy !== mainCurrency) {
      const mainAvailNative = availableInCurrency(mainCurrency)
      if (mainAvailNative > 0) {
        // Convert what we still need (trade-ccy) to main-ccy
        const fxFromMain = lookupFxRate(mainCurrency, ccy, fxRates)
        if (fxFromMain && fxFromMain > 0) {
          const tradeFromOneMain = fxFromMain
          const mainNeeded = remaining / tradeFromOneMain
          const mainSpend = Math.min(mainNeeded, mainAvailNative)
          const mainL = ensure(mainCurrency)
          mainL.transferOut += mainSpend
          const tradeIn = mainSpend * tradeFromOneMain
          l.transferIn += tradeIn
          l.buys += tradeIn
          remaining -= tradeIn
        }
      }
    }

    // Priority 3: other balances, descending by trade-ccy value
    if (remaining > 0) {
      const candidates = Object.keys(ledger)
        .filter(c => c !== ccy && c !== mainCurrency)
        .map(c => ({ ccy: c, avail: availableInCurrency(c) }))
        .filter(x => x.avail > 0)
        .map(x => ({ ...x, valueInTrade: convertWithFx(x.avail, x.ccy, ccy, fxRates) ?? 0 }))
        .sort((a, b) => b.valueInTrade - a.valueInTrade)
      for (const c of candidates) {
        if (remaining <= 0) break
        const fxOtherToTrade = lookupFxRate(c.ccy, ccy, fxRates)
        if (!fxOtherToTrade || fxOtherToTrade <= 0) continue
        const otherNeeded = remaining / fxOtherToTrade
        const otherSpend = Math.min(otherNeeded, c.avail)
        const otherL = ensure(c.ccy)
        otherL.transferOut += otherSpend
        const tradeIn = otherSpend * fxOtherToTrade
        l.transferIn += tradeIn
        l.buys += tradeIn
        remaining -= tradeIn
      }
    }

    if (remaining > 0.01) {
      shortfall[ccy] = (shortfall[ccy] ?? 0) + remaining
    }
  }

  // Finalise `end` per currency
  for (const ccy of Object.keys(ledger)) {
    const l = ledger[ccy]
    l.end = l.start + l.topUp + l.sells + l.transferIn - l.buys - l.transferOut
  }

  return { perCurrency: ledger, shortfall }
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
  for (const row of rows) {
    if (!row.included || row.executedAt) continue
    const d = derived[row.id]
    if (!d?.dividend) continue
    // Trade-value-in-main-currency = the row's tradeValue × rateToMain
    const tradeValMain = (side === 'sell' ? d.mainCurrencyValue : d.mainCurrencyValue) ?? 0
    if (tradeValMain <= 0) continue
    weightSum += tradeValMain
    if (d.dividend.fwdPct != null) weightedFwdPct += d.dividend.fwdPct * tradeValMain
    if (d.dividend.ttmPct != null) weightedTtmPct += d.dividend.ttmPct * tradeValMain

    const fwdMonthGrossMain = convertWithFx(d.dividend.fwdMonthGross, row.currency, mainCurrency, fxRates)
    const fwdMonthNetMain   = convertWithFx(d.dividend.fwdMonthNet,   row.currency, mainCurrency, fxRates)
    if (fwdMonthGrossMain != null) monthGross += fwdMonthGrossMain
    if (fwdMonthNetMain   != null) monthNet   += fwdMonthNetMain
  }
  const avgFwdPct = weightSum > 0 ? weightedFwdPct / weightSum : null
  const avgTtmPct = weightSum > 0 ? weightedTtmPct / weightSum : null
  return { avgFwdPct, avgTtmPct, monthGross, monthNet, weightSum }
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
