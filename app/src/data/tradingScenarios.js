import { nanoid } from 'nanoid'

const KEY = 'rmoney_trading_scenarios'
const ACTIVE_KEY = 'rmoney_trading_scenarios_active'
const LAST_BUY_ACCOUNT_KEY = 'rmoney_trading_scenarios_last_buy_account'

function load() { try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)) }

function blankScenario(name) {
  const now = new Date().toISOString()
  return {
    id: nanoid(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    sellRows: [],
    buyRows: [],
    cashTopUps: {},
    fxOverrides: {},
    displayedCurrencies: [],
    removeExecutedRows: false,
    ignoreActualBalances: false,
  }
}

export function getTradingScenarios() {
  return load().sort((a, b) => a.name.localeCompare(b.name))
}

export function getTradingScenario(id) {
  return load().find(s => s.id === id) ?? null
}

export function createTradingScenario(name) {
  const s = blankScenario(name)
  save([...load(), s])
  setActiveScenarioId(s.id)
  return s
}

export function updateTradingScenario(id, fields) {
  const updatedAt = new Date().toISOString()
  save(load().map(s => s.id === id ? { ...s, ...fields, updatedAt } : s))
}

export function renameTradingScenario(id, name) {
  updateTradingScenario(id, { name: name.trim() })
}

export function duplicateTradingScenario(id) {
  const original = getTradingScenario(id)
  if (!original) return null
  const copy = {
    ...JSON.parse(JSON.stringify(original)),
    id: nanoid(),
    name: `${original.name} (copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  // Reset execution state on copied rows so they can be executed in the duplicate.
  copy.sellRows = (copy.sellRows ?? []).map(r => ({ ...r, id: nanoid(), executedAt: null, executedTransactionId: null }))
  copy.buyRows  = (copy.buyRows  ?? []).map(r => ({ ...r, id: nanoid(), executedAt: null, executedTransactionId: null }))
  save([...load(), copy])
  setActiveScenarioId(copy.id)
  return copy
}

export function deleteTradingScenario(id) {
  save(load().filter(s => s.id !== id))
  if (getActiveScenarioId() === id) {
    const remaining = load()
    setActiveScenarioId(remaining[0]?.id ?? null)
  }
}

// ─── Active scenario (per-device picker state) ────────────────────────────────

export function getActiveScenarioId() {
  return localStorage.getItem(ACTIVE_KEY) || null
}

export function setActiveScenarioId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

// ─── Row helpers ──────────────────────────────────────────────────────────────

function blankRow({ ticker, stockExchange, currency, investingAccountId, shares }) {
  return {
    id: nanoid(),
    ticker,
    stockExchange: stockExchange ?? null,
    currency: currency ?? null,
    investingAccountId,
    shares: Number(shares) || 0,
    adjustedPriceRule: 'last',
    adjustedPriceDecimals: 2,
    adjustedPriceManual: null,
    manualFeeOverride: null,
    included: true,
    executedAt: null,
    executedTransactionId: null,
  }
}

export function addSellRow(scenarioId, row) {
  const sc = getTradingScenario(scenarioId)
  if (!sc) return null
  const next = { ...blankRow(row), lotAllocations: null }
  updateTradingScenario(scenarioId, { sellRows: [...sc.sellRows, next] })
  return next
}

export function addBuyRow(scenarioId, row) {
  const sc = getTradingScenario(scenarioId)
  if (!sc) return null
  const next = blankRow(row)
  updateTradingScenario(scenarioId, { buyRows: [...sc.buyRows, next] })
  setLastBuyAccountId(row.investingAccountId)
  return next
}

export function updateSellRow(scenarioId, rowId, fields) {
  const sc = getTradingScenario(scenarioId)
  if (!sc) return
  updateTradingScenario(scenarioId, {
    sellRows: sc.sellRows.map(r => r.id === rowId ? { ...r, ...fields } : r),
  })
}

export function updateBuyRow(scenarioId, rowId, fields) {
  const sc = getTradingScenario(scenarioId)
  if (!sc) return
  updateTradingScenario(scenarioId, {
    buyRows: sc.buyRows.map(r => r.id === rowId ? { ...r, ...fields } : r),
  })
  if (fields.investingAccountId) setLastBuyAccountId(fields.investingAccountId)
}

export function removeSellRow(scenarioId, rowId) {
  const sc = getTradingScenario(scenarioId)
  if (!sc) return
  updateTradingScenario(scenarioId, { sellRows: sc.sellRows.filter(r => r.id !== rowId) })
}

export function removeBuyRow(scenarioId, rowId) {
  const sc = getTradingScenario(scenarioId)
  if (!sc) return
  updateTradingScenario(scenarioId, { buyRows: sc.buyRows.filter(r => r.id !== rowId) })
}

// ─── Overview state per scenario ──────────────────────────────────────────────

export function setCashTopUp(scenarioId, currency, amount) {
  const sc = getTradingScenario(scenarioId)
  if (!sc) return
  const next = { ...(sc.cashTopUps ?? {}) }
  const n = Number(amount)
  if (!Number.isFinite(n) || n === 0) delete next[currency]
  else next[currency] = n
  updateTradingScenario(scenarioId, { cashTopUps: next })
}

export function setFxOverride(scenarioId, pair, rate) {
  const sc = getTradingScenario(scenarioId)
  if (!sc) return
  const next = { ...(sc.fxOverrides ?? {}) }
  const n = Number(rate)
  if (!Number.isFinite(n) || n <= 0) delete next[pair]
  else next[pair] = n
  updateTradingScenario(scenarioId, { fxOverrides: next })
}

export function setDisplayedCurrencies(scenarioId, list) {
  updateTradingScenario(scenarioId, { displayedCurrencies: [...new Set(list)] })
}

export function setRemoveExecutedRows(scenarioId, value) {
  updateTradingScenario(scenarioId, { removeExecutedRows: !!value })
}

export function setIgnoreActualBalances(scenarioId, value) {
  updateTradingScenario(scenarioId, { ignoreActualBalances: !!value })
}

// Marks a row as executed and (per scenario.removeExecutedRows) optionally
// drops it. Used by SPEC-034 Execute flow.
export function markRowExecuted(scenarioId, side /* 'sell' | 'buy' */, rowId, transactionId) {
  const sc = getTradingScenario(scenarioId)
  if (!sc) return
  const stamp = { executedAt: new Date().toISOString(), executedTransactionId: transactionId, included: false }
  if (side === 'sell') {
    const next = sc.sellRows.map(r => r.id === rowId ? { ...r, ...stamp } : r)
    updateTradingScenario(scenarioId, {
      sellRows: sc.removeExecutedRows ? next.filter(r => r.id !== rowId) : next,
    })
  } else {
    const next = sc.buyRows.map(r => r.id === rowId ? { ...r, ...stamp } : r)
    updateTradingScenario(scenarioId, {
      buyRows: sc.removeExecutedRows ? next.filter(r => r.id !== rowId) : next,
    })
  }
}

// ─── Most-recently-used investing account (used as Buy-row default) ───────────

export function getLastBuyAccountId() {
  return localStorage.getItem(LAST_BUY_ACCOUNT_KEY) || null
}

export function setLastBuyAccountId(id) {
  if (id) localStorage.setItem(LAST_BUY_ACCOUNT_KEY, id)
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function getTradingScenariosStorageBytes() {
  const raw = localStorage.getItem(KEY) ?? '[]'
  return new Blob([raw]).size
}

export function getTradingScenariosStats() {
  const list = load()
  const perScenario = list.map(s => ({
    id: s.id,
    name: s.name,
    sellRows: (s.sellRows ?? []).length,
    buyRows: (s.buyRows ?? []).length,
    bytes: new Blob([JSON.stringify(s)]).size,
  })).sort((a, b) => b.bytes - a.bytes)
  return {
    scenarioCount: list.length,
    bytes: getTradingScenariosStorageBytes(),
    perScenario,
  }
}

export function deleteAllTradingScenarios() {
  save([])
  setActiveScenarioId(null)
}
