import { getCashBalanceByCurrency, createCashBalance, addCashMovement, getInvestingAccounts } from './investingAccounts'
import { getHistoricalForex } from './marketDataClient'
import { getMainCurrency } from './settings'

const KEY = 'rmoney_stock_transactions'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] }
}
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)) }

// SPEC-036 (Phase 20 crypto): the rmoney_stock_transactions collection is shared
// across asset classes, discriminated by an `assetClass` field. Records created
// before this phase carry no field — their ABSENCE is the canonical marker for a
// stock record (D6). Cross-asset queries below take an `assetClass` argument that
// defaults to STOCK, so every existing caller keeps stock-only behaviour and crypto
// is strictly opt-in (pass ASSET_CLASS.CRYPTO).
export const ASSET_CLASS = { STOCK: 'stock', CRYPTO: 'crypto' }
export function assetClassOf(txn) {
  return txn.assetClass ?? ASSET_CLASS.STOCK
}

export function getStockTransaction(id) {
  return load().find(t => t.id === id) ?? null
}

export function getStockTransactions(investingAccountId) {
  return load()
    .filter(t => t.investingAccountId === investingAccountId)
    .sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt) - new Date(a.createdAt))
}

// All buy/sell/split/transfer records for a ticker across every investing account,
// scoped to one asset class (defaults to stock — see ASSET_CLASS note above).
export function getStockTransactionsByTicker(ticker, assetClass = ASSET_CLASS.STOCK) {
  const norm = ticker.trim().toUpperCase()
  return load()
    .filter(t => t.ticker === norm && assetClassOf(t) === assetClass && (t.type === 'buy' || t.type === 'sell' || t.type === 'split' || t.type === 'transfer'))
    .sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt) - new Date(a.createdAt))
}

// Returns true if the ticker has at least one open lot in any investing account.
// Used by the Stock inventory archive precondition (Phase 30).
export function hasOpenLotsForTicker(ticker, assetClass = ASSET_CLASS.STOCK) {
  const t = ticker.trim().toUpperCase()
  const accounts = getInvestingAccounts()
  return accounts.some(a => getOpenLots(a.id, t, null, assetClass).some(lot => lot.remainingShares > 0))
}

// All tickers that appear in any buy transaction of the given asset class, across every account
export function getAllKnownTickers(assetClass = ASSET_CLASS.STOCK) {
  return [...new Set(load().filter(t => t.type === 'buy' && assetClassOf(t) === assetClass).map(t => t.ticker))].sort()
}

// Returns buy lots sorted oldest-first, each augmented with remainingShares (shares not yet consumed by sells/transfers-out).
// Lots are split-adjusted: shares scale up and price scales down by any split that happened after the buy.
// Sell/transfer-out allocations are translated into the post-split basis using splits that happened after them.
// Transfers-in (where this account is the destination) are synthesized as lots preserving the original buy's date and price.
// asOfDate (optional ISO date): when provided, only transactions dated ≤ asOfDate are considered. Splits after
// asOfDate are ignored, so the returned shares/price reflect the lot as it existed at end-of-day on asOfDate.
// assetClass (defaults to stock): isolates lots to one asset class so a stock and a crypto sharing a ticker
// symbol never mix (D6). Crypto callers pass ASSET_CLASS.CRYPTO.
export function getOpenLots(investingAccountId, ticker, asOfDate = null, assetClass = ASSET_CLASS.STOCK) {
  const all = load().filter(t => t.ticker === ticker && assetClassOf(t) === assetClass && (!asOfDate || t.date <= asOfDate))

  // Direct buys in this account
  const directBuys = all.filter(t => t.type === 'buy' && t.investingAccountId === investingAccountId)

  // Transfers where this account is the destination — synthesize lots from their allocations
  const transfersIn = all.filter(t => t.type === 'transfer' && t.destinationInvestingAccountId === investingAccountId)
  const transferInLots = []
  for (const xfer of transfersIn) {
    for (const alloc of xfer.lotAllocations ?? []) {
      const source = all.find(t => t.id === alloc.sourceBuyId)
      if (!source) continue
      transferInLots.push({
        id: `${xfer.id}:${alloc.sourceBuyId}`,
        type: 'buy',
        date: source.date,
        price: source.price,
        currency: source.currency,
        shares: alloc.sharesFromLot,
        ticker: source.ticker,
        investingAccountId,
        transferredFromBuyId: alloc.sourceBuyId,
        transferredFromTransferId: xfer.id,
        createdAt: xfer.createdAt,
      })
    }
  }

  const buys = [...directBuys, ...transferInLots]
    .sort((a, b) => a.date.localeCompare(b.date) || new Date(a.createdAt) - new Date(b.createdAt))

  // Sells AND transfers-out from this account both consume lots
  const consumers = all.filter(t =>
    (t.type === 'sell' || t.type === 'transfer') && t.investingAccountId === investingAccountId
  )
  const splits = all.filter(t => t.type === 'split' && t.investingAccountId === investingAccountId)

  // Cumulative split multiplier for events strictly after `dateStr`.
  function splitMultiplierAfter(dateStr) {
    return splits
      .filter(s => s.date > dateStr)
      .reduce((m, s) => m * (s.ratio.numerator / s.ratio.denominator), 1)
  }

  const consumed = {}
  for (const c of consumers) {
    const m = splitMultiplierAfter(c.date)
    for (const alloc of c.lotAllocations ?? []) {
      consumed[alloc.sourceBuyId] = (consumed[alloc.sourceBuyId] ?? 0) + alloc.sharesFromLot * m
    }
  }

  return buys
    .map(buy => {
      const m = splitMultiplierAfter(buy.date)
      const adjustedShares = buy.shares * m
      const adjustedPrice  = m === 0 ? 0 : buy.price / m
      // Fee-inclusive price: (shares × price + fee) / shares, pro-rated by split multiplier.
      // Transfer-in lots carry no fee (fee was paid in the source account).
      const fee = buy.fee ?? 0
      const feeInclusivePrice = adjustedShares > 0 ? adjustedPrice + fee / adjustedShares : adjustedPrice
      return {
        ...buy,
        shares: adjustedShares,
        price: adjustedPrice,
        feeInclusivePrice,
        remainingShares: adjustedShares - (consumed[buy.id] ?? 0),
      }
    })
    .filter(lot => lot.remainingShares > 0.000001)
}

// Returns current open positions (ticker, shares, avgCost, currency) for an account,
// scoped to one asset class (defaults to stock — see ASSET_CLASS note above).
export function getPositions(investingAccountId, assetClass = ASSET_CLASS.STOCK) {
  const all = load()
  const directTickers = all
    .filter(t => t.type === 'buy' && t.investingAccountId === investingAccountId && assetClassOf(t) === assetClass)
    .map(t => t.ticker)
  const transferInTickers = all
    .filter(t => t.type === 'transfer' && t.destinationInvestingAccountId === investingAccountId && assetClassOf(t) === assetClass)
    .map(t => t.ticker)
  const tickers = [...new Set([...directTickers, ...transferInTickers])]

  const positions = []
  for (const ticker of tickers) {
    const lots = getOpenLots(investingAccountId, ticker, null, assetClass)
    if (lots.length === 0) continue
    const shares = lots.reduce((s, l) => s + l.remainingShares, 0)
    if (shares < 0.000001) continue
    const totalCost = lots.reduce((s, l) => s + l.remainingShares * l.feeInclusivePrice, 0)
    positions.push({ ticker, shares, avgCost: totalCost / shares, currency: lots[0].currency })
  }
  return positions.sort((a, b) => a.ticker.localeCompare(b.ticker))
}

// FIFO allocation: oldest lots first. Returns { allocations, satisfied }.
export function computeFifoAllocations(openLots, totalShares) {
  const allocations = []
  let remaining = totalShares
  for (const lot of openLots) {
    if (remaining <= 0.000001) break
    const take = Math.min(lot.remainingShares, remaining)
    allocations.push({ sourceBuyId: lot.id, sharesFromLot: take })
    remaining -= take
  }
  return { allocations, satisfied: remaining <= 0.000001 }
}

export function createBuy({ date, investingAccountId, ticker, stockExchange = null, wallet = null, assetClass = ASSET_CLASS.STOCK, shares, price, currency, fee = 0, transactionExternalId = null, exchangeRates = null }) {
  let balance = getCashBalanceByCurrency(investingAccountId, currency)
  if (!balance) balance = createCashBalance({ investingAccountId, currency, openingBalance: 0 })

  const normCurrency = currency.trim().toUpperCase()
  const txn = {
    id: crypto.randomUUID(),
    type: 'buy',
    date,
    investingAccountId,
    ticker: ticker.trim().toUpperCase(),
    stockExchange: stockExchange?.trim() || null,
    shares: Number(shares),
    price: Number(price),
    currency: normCurrency,
    fee: Number(fee),
    feeCurrency: normCurrency,
    transactionExternalId: transactionExternalId?.trim() || null,
    lotAllocations: null,
    exchangeRates,
    createdAt: new Date().toISOString(),
  }
  // SPEC-036 (D1/D6): stamp crypto-only fields so stock records stay byte-identical (absence ⇒ stock).
  // `wallet` is the exchange-slot analogue; fractional `shares` flow through unchanged.
  if (assetClass === ASSET_CLASS.CRYPTO) {
    txn.assetClass = ASSET_CLASS.CRYPTO
    txn.wallet = wallet?.trim() || null
  }
  save([...load(), txn])

  const mvtSnapshot = exchangeRates
    ? { mainCurrency: exchangeRates.mainCurrency, rateToMain: exchangeRates.rateToMain, capturedAt: exchangeRates.capturedAt }
    : null
  addCashMovement({ type: 'buy', date, cashBalanceId: balance.id, amount: -(Number(shares) * Number(price)), linkedStockTransactionId: txn.id, exchangeRatesSnapshot: mvtSnapshot })
  if (Number(fee) > 0) {
    addCashMovement({ type: 'buy-fee', date, cashBalanceId: balance.id, amount: -Number(fee), linkedStockTransactionId: txn.id, exchangeRatesSnapshot: mvtSnapshot })
  }
  return txn
}

export function createSell({ date, investingAccountId, ticker, stockExchange = null, wallet = null, assetClass = ASSET_CLASS.STOCK, shares, price, currency, fee = 0, transactionExternalId = null, lotAllocations = null, exchangeRates = null }) {
  if (!lotAllocations) {
    const { allocations } = computeFifoAllocations(getOpenLots(investingAccountId, ticker, null, assetClass), Number(shares))
    lotAllocations = allocations
  }

  let balance = getCashBalanceByCurrency(investingAccountId, currency)
  if (!balance) balance = createCashBalance({ investingAccountId, currency, openingBalance: 0 })

  const normCurrency = currency.trim().toUpperCase()
  const txn = {
    id: crypto.randomUUID(),
    type: 'sell',
    date,
    investingAccountId,
    ticker: ticker.trim().toUpperCase(),
    stockExchange: stockExchange?.trim() || null,
    shares: Number(shares),
    price: Number(price),
    currency: normCurrency,
    fee: Number(fee),
    feeCurrency: normCurrency,
    transactionExternalId: transactionExternalId?.trim() || null,
    lotAllocations,
    exchangeRates,
    createdAt: new Date().toISOString(),
  }
  // SPEC-036 (D1/D6): stamp crypto-only fields; FIFO/LIFO lot selection above is scoped to the
  // matching asset class so a crypto sell only consumes crypto lots.
  if (assetClass === ASSET_CLASS.CRYPTO) {
    txn.assetClass = ASSET_CLASS.CRYPTO
    txn.wallet = wallet?.trim() || null
  }
  save([...load(), txn])

  const mvtSnapshot = exchangeRates
    ? { mainCurrency: exchangeRates.mainCurrency, rateToMain: exchangeRates.rateToMain, capturedAt: exchangeRates.capturedAt }
    : null
  addCashMovement({ type: 'sell', date, cashBalanceId: balance.id, amount: Number(shares) * Number(price), linkedStockTransactionId: txn.id, exchangeRatesSnapshot: mvtSnapshot })
  if (Number(fee) > 0) {
    addCashMovement({ type: 'sell-fee', date, cashBalanceId: balance.id, amount: -Number(fee), linkedStockTransactionId: txn.id, exchangeRatesSnapshot: mvtSnapshot })
  }
  return txn
}

export function canDeleteStockTransaction(id) {
  const all = load()
  const txn = all.find(t => t.id === id)
  if (!txn) return { canDelete: true }

  if (txn.type === 'buy') {
    // Sells AND transfers-out from this account that consumed this lot
    const blocking = all.filter(t =>
      (t.type === 'sell' || t.type === 'transfer') &&
      t.investingAccountId === txn.investingAccountId &&
      t.ticker === txn.ticker &&
      t.lotAllocations?.some(a => a.sourceBuyId === id)
    )
    if (blocking.length > 0) {
      const sells = blocking.filter(t => t.type === 'sell').length
      const xfers = blocking.filter(t => t.type === 'transfer').length
      const parts = []
      if (sells > 0) parts.push(`${sells} sell record(s)`)
      if (xfers > 0) parts.push(`${xfers} transfer record(s)`)
      return { canDelete: false, reason: `This buy's lot is used by ${parts.join(' and ')}. Delete those first.` }
    }
  }

  if (txn.type === 'transfer') {
    // Sells in the destination account that consumed any of the transferred-in synthetic lots
    const syntheticLotIds = new Set((txn.lotAllocations ?? []).map(a => `${txn.id}:${a.sourceBuyId}`))
    const blocking = all.filter(t =>
      t.type === 'sell' &&
      t.investingAccountId === txn.destinationInvestingAccountId &&
      t.ticker === txn.ticker &&
      t.lotAllocations?.some(a => syntheticLotIds.has(a.sourceBuyId))
    )
    if (blocking.length > 0) {
      return { canDelete: false, reason: `${blocking.length} sell record(s) in the destination account consumed shares from this transfer. Delete those sells first.` }
    }
  }

  return { canDelete: true }
}

export function deleteStockTransaction(id) {
  const { canDelete, reason } = canDeleteStockTransaction(id)
  if (!canDelete) throw new Error(reason)
  const KEY_MOVEMENTS = 'rmoney_cash_movements'

  // If deleting a buy, also cascade-delete any currency-exchange triggered by it.
  const txn = load().find(t => t.id === id)
  if (txn?.type === 'buy') {
    const triggeredExchange = load().find(t => t.type === 'currency-exchange' && t.triggeredByStockTransactionId === id)
    if (triggeredExchange) {
      try {
        const movements = JSON.parse(localStorage.getItem(KEY_MOVEMENTS)) ?? []
        localStorage.setItem(KEY_MOVEMENTS, JSON.stringify(movements.filter(m => m.linkedStockTransactionId !== triggeredExchange.id)))
      } catch {}
      save(load().filter(t => t.id !== triggeredExchange.id))
    }
  }

  try {
    const movements = JSON.parse(localStorage.getItem(KEY_MOVEMENTS)) ?? []
    localStorage.setItem(KEY_MOVEMENTS, JSON.stringify(movements.filter(m => m.linkedStockTransactionId !== id)))
  } catch {}
  save(load().filter(t => t.id !== id))
}

export function createCurrencyExchange({
  date,
  investingAccountId,
  sourceCashBalanceId,
  sourceAmount,
  targetCashBalanceId,
  exchangeRate,
  feeAmount = 0,
  feeCashBalanceId = null,
  triggeredByStockTransactionId = null,
  exchangeRates = null,
}) {
  const txn = {
    id: crypto.randomUUID(),
    type: 'currency-exchange',
    investingAccountId,
    date,
    sourceCashBalanceId,
    sourceAmount: Number(sourceAmount),
    targetCashBalanceId,
    targetAmount: Number(sourceAmount) * Number(exchangeRate),
    exchangeRate: Number(exchangeRate),
    feeCashBalanceId: (feeCashBalanceId && Number(feeAmount) > 0) ? feeCashBalanceId : null,
    feeAmount: Number(feeAmount) > 0 ? Number(feeAmount) : null,
    triggeredByStockTransactionId,
    exchangeRates,
    createdAt: new Date().toISOString(),
  }
  save([...load(), txn])
  const srcSnapshot = (exchangeRates?.sourceRateToMain != null)
    ? { mainCurrency: exchangeRates.mainCurrency, rateToMain: exchangeRates.sourceRateToMain, capturedAt: exchangeRates.capturedAt }
    : null
  const tgtSnapshot = (exchangeRates?.targetRateToMain != null)
    ? { mainCurrency: exchangeRates.mainCurrency, rateToMain: exchangeRates.targetRateToMain, capturedAt: exchangeRates.capturedAt }
    : null
  addCashMovement({ type: 'currency-exchange', date, cashBalanceId: sourceCashBalanceId, amount: -Number(sourceAmount), linkedExchangeId: txn.id, linkedStockTransactionId: txn.id, exchangeRatesSnapshot: srcSnapshot })
  addCashMovement({ type: 'currency-exchange', date, cashBalanceId: targetCashBalanceId, amount: Number(sourceAmount) * Number(exchangeRate), linkedExchangeId: txn.id, linkedStockTransactionId: txn.id, exchangeRatesSnapshot: tgtSnapshot })
  if (Number(feeAmount) > 0 && feeCashBalanceId) {
    addCashMovement({ type: 'exchange-fee', date, cashBalanceId: feeCashBalanceId, amount: -Number(feeAmount), linkedExchangeId: txn.id, linkedStockTransactionId: txn.id })
  }
  return txn
}

export function updateCurrencyExchange(id, {
  date,
  sourceAmount,
  exchangeRate,
  feeAmount = 0,
  feeCashBalanceId = null,
  exchangeRates = null,
}) {
  const txns = load()
  const txn = txns.find(t => t.id === id)
  if (!txn || txn.type !== 'currency-exchange') throw new Error('Currency exchange not found')

  const KEY_MOVEMENTS = 'rmoney_cash_movements'
  try {
    const movements = JSON.parse(localStorage.getItem(KEY_MOVEMENTS)) ?? []
    localStorage.setItem(KEY_MOVEMENTS, JSON.stringify(movements.filter(m => m.linkedStockTransactionId !== id)))
  } catch {}

  const updated = {
    ...txn,
    date,
    sourceAmount: Number(sourceAmount),
    targetAmount: Number(sourceAmount) * Number(exchangeRate),
    exchangeRate: Number(exchangeRate),
    feeCashBalanceId: (feeCashBalanceId && Number(feeAmount) > 0) ? feeCashBalanceId : null,
    feeAmount: Number(feeAmount) > 0 ? Number(feeAmount) : null,
    exchangeRates,
  }
  save(txns.map(t => t.id === id ? updated : t))

  const srcSnapshot = (exchangeRates?.sourceRateToMain != null)
    ? { mainCurrency: exchangeRates.mainCurrency, rateToMain: exchangeRates.sourceRateToMain, capturedAt: exchangeRates.capturedAt }
    : null
  const tgtSnapshot = (exchangeRates?.targetRateToMain != null)
    ? { mainCurrency: exchangeRates.mainCurrency, rateToMain: exchangeRates.targetRateToMain, capturedAt: exchangeRates.capturedAt }
    : null
  addCashMovement({ type: 'currency-exchange', date, cashBalanceId: txn.sourceCashBalanceId, amount: -Number(sourceAmount), linkedExchangeId: id, linkedStockTransactionId: id, exchangeRatesSnapshot: srcSnapshot })
  addCashMovement({ type: 'currency-exchange', date, cashBalanceId: txn.targetCashBalanceId, amount: Number(sourceAmount) * Number(exchangeRate), linkedExchangeId: id, linkedStockTransactionId: id, exchangeRatesSnapshot: tgtSnapshot })
  if (Number(feeAmount) > 0 && feeCashBalanceId) {
    addCashMovement({ type: 'exchange-fee', date, cashBalanceId: feeCashBalanceId, amount: -Number(feeAmount), linkedExchangeId: id, linkedStockTransactionId: id })
  }
  return updated
}

export function hasStockActivity(investingAccountId) {
  return load().some(t => t.investingAccountId === investingAccountId ||
                          (t.type === 'transfer' && t.destinationInvestingAccountId === investingAccountId))
}

// Transfer shares from one investing account to another. No cash moves with the shares.
// Cost basis and original buy date are preserved on the destination side via getOpenLots synthesis.
// Optional fee is debited from a chosen cash balance in the SOURCE account as a `transfer-fee` cashMovement.
export function createTransfer({
  date,
  investingAccountId,                  // source
  destinationInvestingAccountId,
  ticker,
  shares,
  lotAllocations = null,
  fee = 0,
  feeCashBalanceId = null,
  transactionExternalId = null,
}) {
  if (!destinationInvestingAccountId || destinationInvestingAccountId === investingAccountId) {
    throw new Error('Transfer requires a different destination investing account')
  }
  const norm = ticker.trim().toUpperCase()

  if (!lotAllocations) {
    const { allocations } = computeFifoAllocations(getOpenLots(investingAccountId, norm), Number(shares))
    lotAllocations = allocations
  }

  const txn = {
    id: crypto.randomUUID(),
    type: 'transfer',
    date,
    investingAccountId,
    destinationInvestingAccountId,
    ticker: norm,
    stockExchange: null,
    shares: Number(shares),
    price: null,
    currency: null,
    fee: Number(fee || 0),
    feeCashBalanceId: feeCashBalanceId || null,
    transactionExternalId: transactionExternalId?.trim() || null,
    lotAllocations,
    exchangeRates: null,
    createdAt: new Date().toISOString(),
  }
  save([...load(), txn])

  if (Number(fee) > 0 && feeCashBalanceId) {
    addCashMovement({
      type: 'transfer-fee',
      date,
      cashBalanceId: feeCashBalanceId,
      amount: -Number(fee),
      linkedStockTransactionId: txn.id,
    })
  }
  return txn
}

// Walks all stockTransactions and cashMovements that lack an FX snapshot (or have one for a
// different main currency) and fills them using SPEC-027 historical forex.
// Marks each backfilled record with fxBackfilled: true for transparency.
// Returns { processed, failed } counts.
export async function backfillFxSnapshots({ onProgress } = {}) {
  const mainCurrency = getMainCurrency()
  const KEY_MOVEMENTS = 'rmoney_cash_movements'
  const KEY_BALANCES  = 'rmoney_cash_balances'

  const balances = (() => { try { return JSON.parse(localStorage.getItem(KEY_BALANCES)) ?? [] } catch { return [] } })()
  const balanceCurrency = Object.fromEntries(balances.map(b => [b.id, b.currency]))

  // Per-run cache for (currency, date) → rate to avoid duplicate API calls
  const rateCache = {}
  async function fetchRate(currency, date) {
    if (!currency || !date) return null
    const up = currency.toUpperCase()
    if (up === mainCurrency) return 1
    const key = `${up}_${date}`
    if (key in rateCache) return rateCache[key]
    try {
      const result = await getHistoricalForex(up, mainCurrency, date)
      rateCache[key] = result?.rate ?? null
    } catch {
      rateCache[key] = null
    }
    return rateCache[key]
  }

  let processed = 0
  let failed = 0

  // ── Stock transactions ──────────────────────────────────────────────────────
  const txns = load()
  const updatedTxns = []
  for (let i = 0; i < txns.length; i++) {
    const txn = { ...txns[i] }
    const alreadyDone = txn.exchangeRates && txn.exchangeRates.mainCurrency === mainCurrency
    if (!alreadyDone) {
      if (txn.type === 'buy' || txn.type === 'sell') {
        const rate = await fetchRate(txn.currency, txn.date)
        if (rate != null) {
          txn.exchangeRates = { mainCurrency, rateToMain: rate, capturedAt: new Date().toISOString(), fxBackfilled: true }
          processed++
        } else { failed++ }
      } else if (txn.type === 'currency-exchange') {
        const srcCur = balanceCurrency[txn.sourceCashBalanceId]
        const tgtCur = balanceCurrency[txn.targetCashBalanceId]
        const [srcRate, tgtRate] = await Promise.all([fetchRate(srcCur, txn.date), fetchRate(tgtCur, txn.date)])
        if (srcRate != null || tgtRate != null) {
          txn.exchangeRates = {
            mainCurrency,
            sourceRateToMain: srcRate ?? null,
            targetRateToMain: tgtRate ?? null,
            capturedAt: new Date().toISOString(),
            fxBackfilled: true,
          }
          processed++
        } else { failed++ }
      }
      // transfer and split: leave exchangeRates null
    }
    updatedTxns.push(txn)
    if (onProgress) onProgress({ done: i + 1, total: txns.length })
  }

  // ── Cash movements ──────────────────────────────────────────────────────────
  const movements = (() => { try { return JSON.parse(localStorage.getItem(KEY_MOVEMENTS)) ?? [] } catch { return [] } })()
  const updatedMovements = []
  for (const mov of movements) {
    const m = { ...mov }
    const alreadyDone = m.exchangeRatesSnapshot && m.exchangeRatesSnapshot.mainCurrency === mainCurrency
    if (!alreadyDone && m.type !== 'opening' && m.cashBalanceId) {
      const currency = balanceCurrency[m.cashBalanceId]
      const rate = await fetchRate(currency, m.date)
      if (rate != null) {
        m.exchangeRatesSnapshot = { mainCurrency, rateToMain: rate, capturedAt: new Date().toISOString(), fxBackfilled: true }
        processed++
      } else { failed++ }
    }
    updatedMovements.push(m)
  }

  localStorage.setItem('rmoney_stock_transactions', JSON.stringify(updatedTxns))
  localStorage.setItem(KEY_MOVEMENTS, JSON.stringify(updatedMovements))

  return { processed, failed }
}

// ─── Update functions (Phase 26c) ─────────────────────────────────────────────

// Ticker and currency are not editable to avoid cascading cost-basis changes.
// Editable fields: date, stockExchange, shares, price, fee, transactionExternalId.
// Recaptures FX snapshot when exchangeRates is supplied (caller fetches it when date changed).
export function updateBuy(id, { date, stockExchange, wallet, shares, price, fee, transactionExternalId, exchangeRates }) {
  const txns = load()
  const txn = txns.find(t => t.id === id && t.type === 'buy')
  if (!txn) throw new Error('Buy not found')

  if (txn.feeCurrency && txn.feeCurrency !== txn.currency) {
    throw new Error(`Fee-currency mismatch: fee is in ${txn.feeCurrency} but trade is in ${txn.currency}. Correct the record before editing.`)
  }

  // Item 165: guard against reducing shares below what downstream sells/transfers already consumed
  const newShares = Number(shares)
  const allocated = txns
    .filter(t => (t.type === 'sell' || t.type === 'transfer') && t.lotAllocations?.some(a => a.sourceBuyId === id))
    .reduce((sum, t) => sum + (t.lotAllocations.find(a => a.sourceBuyId === id)?.sharesFromLot ?? 0), 0)
  if (newShares < allocated - 0.000001) {
    throw new Error(`Cannot reduce shares to ${newShares} — ${allocated} shares from this lot are already allocated across existing sell/transfer records.`)
  }

  const KEY_MOVEMENTS = 'rmoney_cash_movements'
  try {
    const movements = JSON.parse(localStorage.getItem(KEY_MOVEMENTS)) ?? []
    localStorage.setItem(KEY_MOVEMENTS, JSON.stringify(movements.filter(m => m.linkedStockTransactionId !== id)))
  } catch {}

  const updated = {
    ...txn,
    date,
    stockExchange: stockExchange?.trim() || null,
    shares: newShares,
    price: Number(price),
    fee: Number(fee || 0),
    transactionExternalId: transactionExternalId?.trim() || null,
    exchangeRates: exchangeRates ?? txn.exchangeRates,
  }
  // SPEC-036: only override `wallet` when the caller supplies it (crypto edit); otherwise
  // the spread above preserves the record's existing assetClass/wallet.
  if (wallet !== undefined) updated.wallet = wallet?.trim() || null
  save(txns.map(t => t.id === id ? updated : t))

  let balance = getCashBalanceByCurrency(txn.investingAccountId, txn.currency)
  if (!balance) balance = createCashBalance({ investingAccountId: txn.investingAccountId, currency: txn.currency, openingBalance: 0 })

  const mvtSnapshot = updated.exchangeRates
    ? { mainCurrency: updated.exchangeRates.mainCurrency, rateToMain: updated.exchangeRates.rateToMain, capturedAt: updated.exchangeRates.capturedAt }
    : null
  addCashMovement({ type: 'buy', date, cashBalanceId: balance.id, amount: -(newShares * Number(price)), linkedStockTransactionId: id, exchangeRatesSnapshot: mvtSnapshot })
  if (Number(fee) > 0) {
    addCashMovement({ type: 'buy-fee', date, cashBalanceId: balance.id, amount: -Number(fee), linkedStockTransactionId: id, exchangeRatesSnapshot: mvtSnapshot })
  }
  return updated
}

// Ticker and currency are not editable. Lot allocations must be re-supplied if shares change.
export function updateSell(id, { date, stockExchange, wallet, shares, price, fee, transactionExternalId, lotAllocations, exchangeRates }) {
  const txns = load()
  const txn = txns.find(t => t.id === id && t.type === 'sell')
  if (!txn) throw new Error('Sell not found')

  if (txn.feeCurrency && txn.feeCurrency !== txn.currency) {
    throw new Error(`Fee-currency mismatch: fee is in ${txn.feeCurrency} but trade is in ${txn.currency}. Correct the record before editing.`)
  }

  const KEY_MOVEMENTS = 'rmoney_cash_movements'
  try {
    const movements = JSON.parse(localStorage.getItem(KEY_MOVEMENTS)) ?? []
    localStorage.setItem(KEY_MOVEMENTS, JSON.stringify(movements.filter(m => m.linkedStockTransactionId !== id)))
  } catch {}

  const finalAllocations = lotAllocations ?? txn.lotAllocations
  const updated = {
    ...txn,
    date,
    stockExchange: stockExchange?.trim() || null,
    shares: Number(shares),
    price: Number(price),
    fee: Number(fee || 0),
    transactionExternalId: transactionExternalId?.trim() || null,
    lotAllocations: finalAllocations,
    exchangeRates: exchangeRates ?? txn.exchangeRates,
  }
  // SPEC-036: only override `wallet` when supplied (crypto edit); spread preserves it otherwise.
  if (wallet !== undefined) updated.wallet = wallet?.trim() || null
  save(txns.map(t => t.id === id ? updated : t))

  let balance = getCashBalanceByCurrency(txn.investingAccountId, txn.currency)
  if (!balance) balance = createCashBalance({ investingAccountId: txn.investingAccountId, currency: txn.currency, openingBalance: 0 })

  const mvtSnapshot = updated.exchangeRates
    ? { mainCurrency: updated.exchangeRates.mainCurrency, rateToMain: updated.exchangeRates.rateToMain, capturedAt: updated.exchangeRates.capturedAt }
    : null
  addCashMovement({ type: 'sell', date, cashBalanceId: balance.id, amount: Number(shares) * Number(price), linkedStockTransactionId: id, exchangeRatesSnapshot: mvtSnapshot })
  if (Number(fee) > 0) {
    addCashMovement({ type: 'sell-fee', date, cashBalanceId: balance.id, amount: -Number(fee), linkedStockTransactionId: id, exchangeRatesSnapshot: mvtSnapshot })
  }
  return updated
}

// Editable: date, ratio. Splits have no cash movements so no movement cleanup needed.
export function updateSplit(id, { date, numerator, denominator }) {
  const txns = load()
  const txn = txns.find(t => t.id === id && t.type === 'split')
  if (!txn) throw new Error('Split not found')
  const updated = { ...txn, date, ratio: { numerator: Number(numerator), denominator: Number(denominator) } }
  save(txns.map(t => t.id === id ? updated : t))
  return updated
}

// Ticker and source investingAccountId are not editable.
// Editable: date, destinationInvestingAccountId, shares, lotAllocations, fee, feeCashBalanceId.
export function updateTransfer(id, { date, destinationInvestingAccountId, shares, lotAllocations, fee, feeCashBalanceId, transactionExternalId }) {
  const txns = load()
  const txn = txns.find(t => t.id === id && t.type === 'transfer')
  if (!txn) throw new Error('Transfer not found')

  const KEY_MOVEMENTS = 'rmoney_cash_movements'
  try {
    const movements = JSON.parse(localStorage.getItem(KEY_MOVEMENTS)) ?? []
    localStorage.setItem(KEY_MOVEMENTS, JSON.stringify(movements.filter(m => m.linkedStockTransactionId !== id)))
  } catch {}

  const finalAllocations = lotAllocations ?? txn.lotAllocations
  const updated = {
    ...txn,
    date,
    destinationInvestingAccountId: destinationInvestingAccountId ?? txn.destinationInvestingAccountId,
    shares: Number(shares),
    fee: Number(fee || 0),
    feeCashBalanceId: feeCashBalanceId || null,
    transactionExternalId: transactionExternalId?.trim() || null,
    lotAllocations: finalAllocations,
  }
  save(txns.map(t => t.id === id ? updated : t))

  if (Number(fee) > 0 && feeCashBalanceId) {
    addCashMovement({ type: 'transfer-fee', date, cashBalanceId: feeCashBalanceId, amount: -Number(fee), linkedStockTransactionId: id })
  }
  return updated
}

export function applySplit({ ticker, date, numerator, denominator }) {
  const norm = ticker.trim().toUpperCase()
  const num = Number(numerator)
  const den = Number(denominator)
  if (!num || num <= 0 || !den || den <= 0) {
    throw new Error('Split ratio must have positive numerator and denominator')
  }

  const txns = load()
  const accountIds = [...new Set(
    txns.filter(t => t.type === 'buy' && t.ticker === norm).map(t => t.investingAccountId)
  )].filter(accId => getOpenLots(accId, norm).length > 0)

  if (accountIds.length === 0) {
    throw new Error(`No open positions of ${norm} to apply a split to`)
  }

  const created = accountIds.map(accId => ({
    id: crypto.randomUUID(),
    type: 'split',
    date,
    investingAccountId: accId,
    ticker: norm,
    stockExchange: null,
    shares: null,
    price: null,
    currency: null,
    fee: 0,
    transactionExternalId: null,
    ratio: { numerator: num, denominator: den },
    lotAllocations: null,
    exchangeRates: null,
    createdAt: new Date().toISOString(),
  }))
  save([...txns, ...created])
  return created
}

// ─── Fee-currency invariant migration (item 291) ──────────────────────────────
// Backfills feeCurrency on existing buy/sell records that predate this field.
// Records where feeCurrency is already set but !== currency get legacyFeeMismatch: true.
// Safe to call multiple times — already-migrated records are left unchanged.
export function migrateFeeCurrencyInvariant() {
  const txns = load()
  let changed = false
  const updated = txns.map(t => {
    if (t.type !== 'buy' && t.type !== 'sell') return t
    if (t.feeCurrency !== undefined) return t  // already migrated
    changed = true
    return { ...t, feeCurrency: t.currency }
  })
  if (changed) save(updated)
}
