import { getCashBalanceByCurrency, createCashBalance, addCashMovement, getInvestingAccounts } from './investingAccounts'
import { getSetting } from './settings'
import { getOpenLots } from './stockTransactions'
import { getApiDividendHistory } from './apiDividendHistory'
import appStorage from '../utils/appStorage'

const KEY = 'rmoney_dividends'
const KEY_MOVEMENTS = 'rmoney_cash_movements'

function load() { try { return JSON.parse(appStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { appStorage.setItem(KEY, JSON.stringify(data)) }

export function computeDividendDerived({ dividendPerShare, shareCount, taxPercent }) {
  const totalBeforeTax = Number(dividendPerShare) * Number(shareCount)
  const taxAmount = totalBeforeTax * (Number(taxPercent) / 100)
  const netTotal = totalBeforeTax - taxAmount
  const netPerShare = Number(shareCount) > 0 ? netTotal / Number(shareCount) : 0
  return { totalBeforeTax, taxAmount, netTotal, netPerShare }
}

// Resolves tax % for a ticker using: per-stock override → per-country → global default.
export function resolveDividendTaxPercent(ticker) {
  const profiles = (() => {
    try { return JSON.parse(appStorage.getItem('rmoney_stock_profiles')) ?? [] }
    catch { return [] }
  })()
  const t = ticker?.trim().toUpperCase()
  const profile = profiles.find(p => p.ticker === t)
  if (profile?.taxPercentOverride != null) return profile.taxPercentOverride
  const divSettings = getSetting('dividends', {})
  const country = profile?.hqCountryOverride ?? profile?.hqCountry ?? null
  if (country) {
    const perCountry = divSettings.perCountryTaxPercent ?? {}
    if (perCountry[country] != null) return perCountry[country]
  }
  return divSettings.defaultTaxPercent ?? 0
}

export function getDividends(investingAccountId) {
  return load()
    .filter(d => d.investingAccountId === investingAccountId)
    .sort((a, b) => b.payoutDate.localeCompare(a.payoutDate) || new Date(b.createdAt) - new Date(a.createdAt))
}

// All dividend records for a ticker across every investing account
export function getDividendsByTicker(ticker) {
  const norm = ticker.trim().toUpperCase()
  return load()
    .filter(d => d.ticker === norm)
    .sort((a, b) => b.payoutDate.localeCompare(a.payoutDate) || new Date(b.createdAt) - new Date(a.createdAt))
}

export function getDividend(id) {
  return load().find(d => d.id === id) ?? null
}

// ─── Status helpers ──────────────────────────────────────────────────────────

function writeCashMovement(dividend) {
  const { netTotal } = computeDividendDerived(dividend)
  let balance = getCashBalanceByCurrency(dividend.investingAccountId, dividend.currency)
  if (!balance) balance = createCashBalance({ investingAccountId: dividend.investingAccountId, currency: dividend.currency, openingBalance: 0 })
  return addCashMovement({
    type: 'dividend',
    date: dividend.payoutDate,
    cashBalanceId: balance.id,
    amount: netTotal,
    linkedDividendId: dividend.id,
  })
}

// ─── createDividend ──────────────────────────────────────────────────────────

export function createDividend({ investingAccountId, ticker, currency, exDividendDate, payoutDate, dividendPerShare, shareCount, taxPercent, type }) {
  const today = new Date().toISOString().slice(0, 10)
  const confirmReceipt = getSetting('dividends', {}).confirmReceipt ?? false

  const status = payoutDate > today
    ? 'pending-payment'
    : confirmReceipt
      ? 'pending-confirmation'
      : 'received'

  const now = new Date().toISOString()
  const dividend = {
    id: crypto.randomUUID(),
    investingAccountId,
    ticker: ticker.trim().toUpperCase(),
    currency: currency.trim().toUpperCase(),
    exDividendDate,
    payoutDate,
    dividendPerShare: Number(dividendPerShare),
    shareCount: Number(shareCount),
    taxPercent: Number(taxPercent),
    type: type === 'special' ? 'special' : 'regular',
    status,
    source: 'user',
    confirmedAt: status === 'received' ? now : null,
    exchangeRates: null,
    cashMovementId: null,
    createdAt: now,
  }
  save([...load(), dividend])

  if (status === 'received') {
    const movement = writeCashMovement(dividend)
    const withMovement = { ...dividend, cashMovementId: movement.id }
    save(load().map(d => d.id === dividend.id ? withMovement : d))
    return withMovement
  }

  return dividend
}

// ─── updateDividend ──────────────────────────────────────────────────────────

export function updateDividend(id, { dividendPerShare, taxPercent, type }) {
  const list = load()
  const dividend = list.find(d => d.id === id)
  if (!dividend) return null

  const updated = {
    ...dividend,
    dividendPerShare: Number(dividendPerShare),
    taxPercent: Number(taxPercent),
    ...(type !== undefined ? { type: type === 'special' ? 'special' : 'regular' } : {}),
  }
  const { netTotal } = computeDividendDerived(updated)
  save(list.map(d => d.id === id ? updated : d))

  if (dividend.cashMovementId) {
    try {
      const movements = JSON.parse(appStorage.getItem(KEY_MOVEMENTS)) ?? []
      appStorage.setItem(KEY_MOVEMENTS, JSON.stringify(
        movements.map(m => m.id === dividend.cashMovementId ? { ...m, amount: netTotal } : m)
      ))
    } catch {}
  }
  return updated
}

// ─── deleteDividend ──────────────────────────────────────────────────────────

// Removes both the dividend record and its linked cash movement (if any).
export function deleteDividend(id) {
  const dividend = load().find(d => d.id === id)
  if (!dividend) return
  if (dividend.cashMovementId) {
    try {
      const movements = JSON.parse(appStorage.getItem(KEY_MOVEMENTS)) ?? []
      appStorage.setItem(KEY_MOVEMENTS, JSON.stringify(
        movements.filter(m => m.id !== dividend.cashMovementId)
      ))
    } catch {}
  }
  save(load().filter(d => d.id !== id))
}

// ─── confirmDividend ─────────────────────────────────────────────────────────

// Transitions a 'pending-confirmation' record to 'received', writes the cash
// movement, and returns the updated record. No-op for already-received records.
export function confirmDividend(id) {
  const list = load()
  const dividend = list.find(d => d.id === id)
  if (!dividend || dividend.status === 'received') return dividend ?? null

  const now = new Date().toISOString()
  const movement = writeCashMovement(dividend)
  const updated = {
    ...dividend,
    status: 'received',
    confirmedAt: now,
    cashMovementId: movement.id,
  }
  save(list.map(d => d.id === id ? updated : d))
  return updated
}

// ─── migrateDividendStatuses ─────────────────────────────────────────────────

// Pure transform — stamps the v1→v2 status model on legacy dividend rows.
// Used by both the boot-time wrapper below AND the v1→v2 backup loader.
export function migrateDividendsArrayToV2(list) {
  return list.map(d => {
    if (d.status !== undefined) return d
    return {
      ...d,
      status: 'received',
      source: 'user',
      confirmedAt: d.createdAt ?? new Date().toISOString(),
    }
  })
}

// One-shot boot migration: stamps every dividend row that predates the status
// model with status: 'received', source: 'user', confirmedAt: createdAt.
// Idempotent — rows that already carry a status field are left untouched.
const MIGRATION_KEY = 'rmoney_dividends_status_migrated_v1'
export function migrateDividendStatuses() {
  if (appStorage.getItem(MIGRATION_KEY) === '1') return
  save(migrateDividendsArrayToV2(load()))
  appStorage.setItem(MIGRATION_KEY, '1')
}

// ─── promoteDividends ────────────────────────────────────────────────────────

// Auto-promote pending-payment records whose payoutDate ≤ today.
// Steps per record:
//   1. Recalculate shareCount from open lots at exDividendDate − 1 (the point
//      of record — the user was entitled to the dividend based on what they
//      held the day before ex-div).
//   2. If recalculated shareCount === 0 → delete the record (the user held no
//      shares on record date). Add a summary to the returned `dropped` array.
//   3. Otherwise → transition to 'received' (or 'pending-confirmation' if the
//      global confirmReceipt toggle is ON), writing a cashMovement only for
//      'received' transitions.
//
// Returns { dropped: [{ ticker, exDividendDate, payoutDate, investingAccountId }] }
export function promoteDividends() {
  const today = new Date().toISOString().slice(0, 10)
  const confirmReceipt = getSetting('dividends', {}).confirmReceipt ?? false
  const list = load()
  const dropped = []

  let changed = false
  const updated = list.map(d => {
    if (d.status !== 'pending-payment') return d
    if (d.payoutDate > today) return d

    // Recalculate shareCount from lots at exDividendDate − 1
    const exDate = new Date(d.exDividendDate)
    exDate.setDate(exDate.getDate() - 1)
    const asOf = exDate.toISOString().slice(0, 10)
    const lots = getOpenLots(d.investingAccountId, d.ticker, asOf)
    const recalcShares = lots.reduce((s, l) => s + l.remainingShares, 0)

    changed = true

    if (recalcShares === 0) {
      dropped.push({ ticker: d.ticker, exDividendDate: d.exDividendDate, payoutDate: d.payoutDate, investingAccountId: d.investingAccountId })
      return null // mark for removal
    }

    const now = new Date().toISOString()
    const nextStatus = confirmReceipt ? 'pending-confirmation' : 'received'
    return {
      ...d,
      shareCount: recalcShares,
      status: nextStatus,
      confirmedAt: nextStatus === 'received' ? now : null,
    }
  }).filter(Boolean)

  if (!changed) return { dropped }

  // Write cash movements for newly-received records (those whose cashMovementId is still null)
  const withMovements = updated.map(d => {
    if (d.status !== 'received' || d.cashMovementId) return d
    const movement = writeCashMovement(d)
    return { ...d, cashMovementId: movement.id }
  })

  save(withMovements)
  return { dropped }
}

export function hasDividendActivity(investingAccountId) {
  return load().some(d => d.investingAccountId === investingAccountId)
}

export function getPendingConfirmationCount() {
  return load().filter(d => d.status === 'pending-confirmation').length
}

export function getPendingConfirmationDividends() {
  return load()
    .filter(d => d.status === 'pending-confirmation')
    .sort((a, b) => a.payoutDate.localeCompare(b.payoutDate) || a.ticker.localeCompare(b.ticker))
}

// Auto-create 'pending-confirmation' records from apiDividendHistory when the
// confirmReceipt toggle is ON. Idempotent — skips (ticker, exDividendDate,
// investingAccountId) triples that already have any dividend record.
export function autoCreatePendingFromApi() {
  if (!getSetting('dividends', {}).confirmReceipt) return

  const today = new Date().toISOString().slice(0, 10)
  const existing = load()
  const existingKeys = new Set(
    existing.map(d => `${d.ticker}|${d.exDividendDate}|${d.investingAccountId}`)
  )

  const profiles = (() => {
    try { return JSON.parse(appStorage.getItem('rmoney_stock_profiles')) ?? [] } catch { return [] }
  })()

  const accounts = getInvestingAccounts()
  const apiHistory = getApiDividendHistory()
  const pastRows = apiHistory.filter(r => r.payDate && r.payDate <= today && r.perShare != null && r.currency)

  const newRecords = []
  for (const row of pastRows) {
    const profile = profiles.find(p => p.ticker === row.ticker)
    if (profile?.paysDividends === false) continue

    for (const account of accounts) {
      const key = `${row.ticker}|${row.exDate}|${account.id}`
      if (existingKeys.has(key)) continue

      const exDate = new Date(row.exDate)
      exDate.setDate(exDate.getDate() - 1)
      const asOf = exDate.toISOString().slice(0, 10)
      const lots = getOpenLots(account.id, row.ticker, asOf)
      const shareCount = lots.reduce((s, l) => s + l.remainingShares, 0)
      if (shareCount === 0) continue

      const taxPercent = resolveDividendTaxPercent(row.ticker)
      const now = new Date().toISOString()
      const record = {
        id: crypto.randomUUID(),
        investingAccountId: account.id,
        ticker: row.ticker,
        currency: row.currency,
        exDividendDate: row.exDate,
        payoutDate: row.payDate,
        dividendPerShare: Number(row.perShare),
        shareCount,
        taxPercent,
        type: row.type === 'special' ? 'special' : 'regular',
        status: 'pending-confirmation',
        source: 'api-auto',
        confirmedAt: null,
        exchangeRates: null,
        cashMovementId: null,
        createdAt: now,
      }
      newRecords.push(record)
      existingKeys.add(key)
    }
  }

  if (newRecords.length > 0) {
    save([...existing, ...newRecords])
  }
}

// Returns { userRecords, apiRecords } if a duplicate exists for this
// (ticker, exDividendDate) or (ticker, payoutDate) pair, otherwise null.
export function checkDuplicateDividend(ticker, exDividendDate, payoutDate) {
  const t = ticker.toUpperCase()
  const userRecords = load().filter(d =>
    d.ticker === t &&
    (d.exDividendDate === exDividendDate || d.payoutDate === payoutDate)
  )
  const apiRecords = getApiDividendHistory().filter(r =>
    r.ticker === t &&
    (r.exDate === exDividendDate || r.payDate === payoutDate)
  )
  if (userRecords.length === 0 && apiRecords.length === 0) return null
  return { userRecords, apiRecords }
}
