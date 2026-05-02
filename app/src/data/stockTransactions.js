import { getCashBalanceByCurrency, createCashBalance, addCashMovement } from './investingAccounts'

const KEY = 'rmoney_stock_transactions'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] }
}
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)) }

export function getStockTransaction(id) {
  return load().find(t => t.id === id) ?? null
}

export function getStockTransactions(investingAccountId) {
  return load()
    .filter(t => t.investingAccountId === investingAccountId)
    .sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt) - new Date(a.createdAt))
}

// All buy/sell/split/transfer records for a ticker across every investing account
export function getStockTransactionsByTicker(ticker) {
  const norm = ticker.trim().toUpperCase()
  return load()
    .filter(t => t.ticker === norm && (t.type === 'buy' || t.type === 'sell' || t.type === 'split' || t.type === 'transfer'))
    .sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt) - new Date(a.createdAt))
}

// All tickers that appear in any buy transaction, across every account
export function getAllKnownTickers() {
  return [...new Set(load().filter(t => t.type === 'buy').map(t => t.ticker))].sort()
}

// Returns buy lots sorted oldest-first, each augmented with remainingShares (shares not yet consumed by sells/transfers-out).
// Lots are split-adjusted: shares scale up and price scales down by any split that happened after the buy.
// Sell/transfer-out allocations are translated into the post-split basis using splits that happened after them.
// Transfers-in (where this account is the destination) are synthesized as lots preserving the original buy's date and price.
export function getOpenLots(investingAccountId, ticker) {
  const all = load().filter(t => t.ticker === ticker)

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
      return {
        ...buy,
        shares: adjustedShares,
        price: adjustedPrice,
        remainingShares: adjustedShares - (consumed[buy.id] ?? 0),
      }
    })
    .filter(lot => lot.remainingShares > 0.000001)
}

// Returns current open positions (ticker, shares, avgCost, currency) for an account.
export function getPositions(investingAccountId) {
  const all = load()
  const directTickers = all
    .filter(t => t.type === 'buy' && t.investingAccountId === investingAccountId)
    .map(t => t.ticker)
  const transferInTickers = all
    .filter(t => t.type === 'transfer' && t.destinationInvestingAccountId === investingAccountId)
    .map(t => t.ticker)
  const tickers = [...new Set([...directTickers, ...transferInTickers])]

  const positions = []
  for (const ticker of tickers) {
    const lots = getOpenLots(investingAccountId, ticker)
    if (lots.length === 0) continue
    const shares = lots.reduce((s, l) => s + l.remainingShares, 0)
    if (shares < 0.000001) continue
    const totalCost = lots.reduce((s, l) => s + l.remainingShares * l.price, 0)
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

export function createBuy({ date, investingAccountId, ticker, stockExchange = null, shares, price, currency, fee = 0, transactionExternalId = null }) {
  let balance = getCashBalanceByCurrency(investingAccountId, currency)
  if (!balance) balance = createCashBalance({ investingAccountId, currency, openingBalance: 0 })

  const txn = {
    id: crypto.randomUUID(),
    type: 'buy',
    date,
    investingAccountId,
    ticker: ticker.trim().toUpperCase(),
    stockExchange: stockExchange?.trim() || null,
    shares: Number(shares),
    price: Number(price),
    currency: currency.trim().toUpperCase(),
    fee: Number(fee),
    transactionExternalId: transactionExternalId?.trim() || null,
    lotAllocations: null,
    exchangeRates: null,
    createdAt: new Date().toISOString(),
  }
  save([...load(), txn])

  addCashMovement({ type: 'buy', date, cashBalanceId: balance.id, amount: -(Number(shares) * Number(price)), linkedStockTransactionId: txn.id })
  if (Number(fee) > 0) {
    addCashMovement({ type: 'buy-fee', date, cashBalanceId: balance.id, amount: -Number(fee), linkedStockTransactionId: txn.id })
  }
  return txn
}

export function createSell({ date, investingAccountId, ticker, stockExchange = null, shares, price, currency, fee = 0, transactionExternalId = null, lotAllocations = null }) {
  if (!lotAllocations) {
    const { allocations } = computeFifoAllocations(getOpenLots(investingAccountId, ticker), Number(shares))
    lotAllocations = allocations
  }

  let balance = getCashBalanceByCurrency(investingAccountId, currency)
  if (!balance) balance = createCashBalance({ investingAccountId, currency, openingBalance: 0 })

  const txn = {
    id: crypto.randomUUID(),
    type: 'sell',
    date,
    investingAccountId,
    ticker: ticker.trim().toUpperCase(),
    stockExchange: stockExchange?.trim() || null,
    shares: Number(shares),
    price: Number(price),
    currency: currency.trim().toUpperCase(),
    fee: Number(fee),
    transactionExternalId: transactionExternalId?.trim() || null,
    lotAllocations,
    exchangeRates: null,
    createdAt: new Date().toISOString(),
  }
  save([...load(), txn])

  addCashMovement({ type: 'sell', date, cashBalanceId: balance.id, amount: Number(shares) * Number(price), linkedStockTransactionId: txn.id })
  if (Number(fee) > 0) {
    addCashMovement({ type: 'sell-fee', date, cashBalanceId: balance.id, amount: -Number(fee), linkedStockTransactionId: txn.id })
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
    triggeredByStockTransactionId: null,
    createdAt: new Date().toISOString(),
  }
  save([...load(), txn])
  addCashMovement({ type: 'currency-exchange', date, cashBalanceId: sourceCashBalanceId, amount: -Number(sourceAmount), linkedExchangeId: txn.id, linkedStockTransactionId: txn.id })
  addCashMovement({ type: 'currency-exchange', date, cashBalanceId: targetCashBalanceId, amount: Number(sourceAmount) * Number(exchangeRate), linkedExchangeId: txn.id, linkedStockTransactionId: txn.id })
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
  }
  save(txns.map(t => t.id === id ? updated : t))

  addCashMovement({ type: 'currency-exchange', date, cashBalanceId: txn.sourceCashBalanceId, amount: -Number(sourceAmount), linkedExchangeId: id, linkedStockTransactionId: id })
  addCashMovement({ type: 'currency-exchange', date, cashBalanceId: txn.targetCashBalanceId, amount: Number(sourceAmount) * Number(exchangeRate), linkedExchangeId: id, linkedStockTransactionId: id })
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

// Manually apply a stock split: writes one `split` stock-transaction record on every investing

// Manually apply a stock split: writes one `split` stock-transaction record on every investing
// account that currently has open lots of the ticker. Splits have no cash-balance effect.
// The split takes effect at calc time via getOpenLots, which scales lots whose date < split.date.
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
