import { clearCacheForTicker } from '../utils/marketDataCache'

const KEY = 'rmoney_stock_profiles'

function load() { try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)) }

export function getStockProfile(ticker) {
  const t = ticker?.trim().toUpperCase()
  return load().find(p => p.ticker === t) ?? null
}

export function getStockProfiles() {
  return load()
}

// Returns only profiles that have not been archived (archived: true).
// Treats missing archived field as false — existing records without the field
// are active by default. Use this in any selection list or dropdown.
export function getActiveStockProfiles() {
  return load().filter(p => p.archived !== true)
}

// Returns only profiles with archived: true.
// Used by the Stock inventory archived view (Phase 30).
export function getArchivedStockProfiles() {
  return load().filter(p => p.archived === true)
}

export function upsertStockProfile(ticker, fields) {
  const t = ticker?.trim().toUpperCase()
  const list = load()
  const existing = list.find(p => p.ticker === t)
  if (existing) {
    save(list.map(p => p.ticker === t ? { ...p, ...fields } : p))
  } else {
    save([...list, { ticker: t, taxPercentOverride: null, ...fields }])
  }
}

// Returns true if the profile has a resolved name
export function isProfileResolved(ticker) {
  return !!getStockProfile(ticker)?.name
}

// ─── Dividend frequency ───────────────────────────────────────────────────────

// Returns the stored dividendFrequency for the ticker, or 'unknown' if not set.
// Possible stored values: 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'unknown'
export function getDividendFrequency(ticker) {
  return getStockProfile(ticker)?.dividendFrequency ?? 'unknown'
}

// ─── Manual price override ───────────────────────────────────────────────────

export function getManualPrice(ticker) {
  return getStockProfile(ticker)?.manualPrice ?? null
}

export function setManualPrice(ticker, amount, currency) {
  upsertStockProfile(ticker, {
    manualPrice: { amount: Number(amount), currency: currency.trim().toUpperCase(), setAt: new Date().toISOString() },
  })
}

export function clearManualPrice(ticker) {
  upsertStockProfile(ticker, { manualPrice: null })
}

// ─── Archive lifecycle ────────────────────────────────────────────────────────

export function archiveStockProfile(ticker) {
  upsertStockProfile(ticker, { archived: true, archivedAt: new Date().toISOString() })
}

export function unarchiveStockProfile(ticker) {
  upsertStockProfile(ticker, { archived: false, archivedAt: null })
}

// Permanently removes the stockProfile row. Caller must ensure no other data
// references this ticker before calling (enforced in the UI by the four-zero
// history-presence precondition).
export function deleteStockProfile(ticker) {
  const t = ticker?.trim().toUpperCase()
  save(load().filter(p => p.ticker !== t))
}

// ─── Ticker rename ────────────────────────────────────────────────────────────

// Renames oldTicker to newTicker across all five ticker-keyed collections and
// clears cached data for the old symbol. resolvedFields is merged onto the new
// profile entry (name, stockExchange, currency, resolvedSource, resolvedAt).
export function renameTicker(oldTicker, newTicker, resolvedFields = {}) {
  const old  = oldTicker.trim().toUpperCase()
  const next = newTicker.trim().toUpperCase()
  if (old === next) return

  // 1. stockProfiles — carry over old entry, merge resolved fields, key under new ticker
  const profiles = load()
  const oldProfile = profiles.find(p => p.ticker === old) ?? { taxPercentOverride: null }
  const { ticker: _drop, ...oldFields } = oldProfile
  const newEntry = { ...oldFields, ...resolvedFields, ticker: next }
  save([...profiles.filter(p => p.ticker !== old && p.ticker !== next), newEntry])

  // 2–5. Cascade rename in other collections
  function renameInKey(storageKey) {
    try {
      const arr = JSON.parse(localStorage.getItem(storageKey)) ?? []
      localStorage.setItem(storageKey, JSON.stringify(
        arr.map(r => r.ticker === old ? { ...r, ticker: next } : r)
      ))
    } catch {}
  }
  renameInKey('rmoney_stock_transactions')
  renameInKey('rmoney_dividends')
  renameInKey('rmoney_watchlist_entries')
  renameInKey('rmoney_portfolio_assignments')

  // 6. Clear cached price / profile / news for the old ticker
  clearCacheForTicker(old)
}
