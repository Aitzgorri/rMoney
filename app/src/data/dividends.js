import { getCashBalanceByCurrency, createCashBalance, addCashMovement } from './investingAccounts'
import { getSetting } from './settings'

const KEY = 'rmoney_dividends'
const KEY_MOVEMENTS = 'rmoney_cash_movements'

function load() { try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)) }

export function computeDividendDerived({ dividendPerShare, shareCount, taxPercent }) {
  const totalBeforeTax = Number(dividendPerShare) * Number(shareCount)
  const taxAmount = totalBeforeTax * (Number(taxPercent) / 100)
  const netTotal = totalBeforeTax - taxAmount
  const netPerShare = Number(shareCount) > 0 ? netTotal / Number(shareCount) : 0
  return { totalBeforeTax, taxAmount, netTotal, netPerShare }
}

// Resolves tax % for a ticker using: per-stock override → global default.
// Country-level is deferred until SPEC-027 provides HQ country lookup.
export function resolveDividendTaxPercent(ticker) {
  const profiles = (() => {
    try { return JSON.parse(localStorage.getItem('rmoney_stock_profiles')) ?? [] }
    catch { return [] }
  })()
  const t = ticker?.trim().toUpperCase()
  const profile = profiles.find(p => p.ticker === t)
  if (profile?.taxPercentOverride != null) return profile.taxPercentOverride
  const divSettings = getSetting('dividends', {})
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

export function createDividend({ investingAccountId, ticker, currency, exDividendDate, payoutDate, dividendPerShare, shareCount, taxPercent, type }) {
  const { netTotal } = computeDividendDerived({ dividendPerShare, shareCount, taxPercent })

  let balance = getCashBalanceByCurrency(investingAccountId, currency)
  if (!balance) balance = createCashBalance({ investingAccountId, currency, openingBalance: 0 })

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
    exchangeRates: null,
    cashMovementId: null,
    createdAt: new Date().toISOString(),
  }
  save([...load(), dividend])

  const movement = addCashMovement({
    type: 'dividend',
    date: payoutDate,
    cashBalanceId: balance.id,
    amount: netTotal,
    linkedDividendId: dividend.id,
  })

  const withMovement = { ...dividend, cashMovementId: movement.id }
  save(load().map(d => d.id === dividend.id ? withMovement : d))
  return withMovement
}

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
      const movements = JSON.parse(localStorage.getItem(KEY_MOVEMENTS)) ?? []
      localStorage.setItem(KEY_MOVEMENTS, JSON.stringify(
        movements.map(m => m.id === dividend.cashMovementId ? { ...m, amount: netTotal } : m)
      ))
    } catch {}
  }
  return updated
}

// Removes both the dividend record and its linked cash movement.
export function deleteDividend(id) {
  const dividend = load().find(d => d.id === id)
  if (!dividend) return
  if (dividend.cashMovementId) {
    try {
      const movements = JSON.parse(localStorage.getItem(KEY_MOVEMENTS)) ?? []
      localStorage.setItem(KEY_MOVEMENTS, JSON.stringify(
        movements.filter(m => m.id !== dividend.cashMovementId)
      ))
    } catch {}
  }
  save(load().filter(d => d.id !== id))
}

export function hasDividendActivity(investingAccountId) {
  return load().some(d => d.investingAccountId === investingAccountId)
}
