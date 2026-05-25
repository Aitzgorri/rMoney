import { clearCacheForTicker } from '../utils/marketDataCache'
import {
  deleteApiDividendHistoryForTicker,
  renameApiDividendHistoryTicker,
} from './apiDividendHistory'
import { renameManualPricesTicker } from './manualPrices'

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

// ─── Confirmation flag (Phase 32j / SPEC-033) ────────────────────────────────

// Sets the user-controlled confirmation flag on a profile. Pass `true` after the
// user has actively endorsed the ticker-to-company mapping (resolution dialog,
// rename dialog, edit-profile save). Pass `false` from the Stock inventory
// toggle when the user wants to mark a row for re-review.
export function setConfirmed(ticker, confirmed) {
  upsertStockProfile(ticker, {
    confirmed: !!confirmed,
    confirmedAt: confirmed ? new Date().toISOString() : null,
  })
}

// One-shot migration: stamps every existing profile that lacks the `confirmed`
// field. Profiles with a resolved `name` are treated as already-confirmed
// (they reached the registry via the resolution dialog historically); profiles
// without a name are unconfirmed. Idempotent — rows that already have the
// field are left untouched.
const MIGRATION_KEY = 'rmoney_stock_profiles_confirmed_migrated_v1'
export function migrateConfirmedField() {
  if (localStorage.getItem(MIGRATION_KEY) === '1') return
  const list = load()
  const now = new Date().toISOString()
  const migrated = list.map(p => {
    if (p.confirmed !== undefined) return p
    if (p.name) return { ...p, confirmed: true, confirmedAt: now }
    return { ...p, confirmed: false, confirmedAt: null }
  })
  save(migrated)
  localStorage.setItem(MIGRATION_KEY, '1')
}

// ─── Dividend frequency ───────────────────────────────────────────────────────

// Returns the stored dividendFrequency for the ticker, or 'unknown' if not set.
// Possible stored values: 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'unknown'
export function getDividendFrequency(ticker) {
  return getStockProfile(ticker)?.dividendFrequency ?? 'unknown'
}

// ─── Manual stocks (Phase 32e / SPEC-029) ────────────────────────────────────

// Returns true when the stock is user-tracked with no provider data
// (pre-IPO RSUs, private equity, custom baskets, delisted holdings the user
// still tracks). For these tickers, the market-data provider chain is bypassed
// and every quote reads from the `manualPrices` collection.
export function isManualStock(ticker) {
  return getStockProfile(ticker)?.isManual === true
}

// Creates a new manual-stock profile. Caller must check ticker uniqueness.
// Sets confirmed: true because the user is explicitly declaring the mapping.
export function createManualStockProfile({ ticker, name, stockExchange, currency, hqCountry }) {
  const now = new Date().toISOString()
  upsertStockProfile(ticker, {
    name: name ?? null,
    stockExchange: stockExchange?.trim() || 'MANUAL',
    currency: currency?.trim().toUpperCase() ?? null,
    hqCountry: hqCountry?.trim() || null,
    isManual: true,
    manualPriceSource: 'user',
    resolvedSource: 'manual',
    resolvedAt: now,
    confirmed: true,
    confirmedAt: now,
  })
}

// ─── Manual price override (per-stock - distinct from manual-stock above) ────

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

// ─── Ticker rename / remap ────────────────────────────────────────────────────

// Renames oldTicker to newTicker across all ticker-keyed collections (mode
// 'rename'), OR remaps the slot to a different security by purging the old
// ticker's data (mode 'remap'). resolvedFields holds the new profile's
// metadata (name, stockExchange, currency, resolvedSource, resolvedAt).
//
// 'rename' — same company, symbol changed. All history follows the symbol.
//            Carries over taxPercentOverride / dividendFrequency / manualPrice /
//            etc. from the old profile. Also rewrites apiDividendHistory rows
//            (fixes the orphan-rows bug present before Phase 32j).
//
// 'remap'  — different security. The user's own records (stockTransactions,
//            dividends, watchlistEntries, portfolioAssignments) are kept —
//            they're the user's own facts about what they did, independent of
//            the API metadata. If the ticker changes, those records are
//            renamed old → next; if it stays the same, they remain in place.
//            The cached/auto-fetched data (apiDividendHistory + meta, profile
//            metadata, hot caches) is cleared so the wrong identity's data
//            doesn't bleed into the new mapping. The new profile starts fresh
//            (no carry-over of taxPercentOverride / dividendFrequency / etc.).
export function renameTicker(oldTicker, newTicker, resolvedFields = {}, mode = 'rename') {
  const old  = oldTicker.trim().toUpperCase()
  const next = newTicker.trim().toUpperCase()
  // Same-ticker rename is a no-op, but a same-ticker remap still has work to
  // do (clear the API caches and replace the profile), even though no records
  // change ticker.
  if (old === next && mode !== 'remap') return

  const profiles = load()
  const oldProfile = profiles.find(p => p.ticker === old)
  // Both modes set confirmed: true — the user actively selected/confirmed the
  // new security through the rename dialog.
  const confirmFields = { confirmed: true, confirmedAt: new Date().toISOString() }

  if (mode === 'remap') {
    // Profile: drop the old entry, write a fresh one with only resolvedFields.
    const newEntry = { ticker: next, taxPercentOverride: null, ...resolvedFields, ...confirmFields }
    save([...profiles.filter(p => p.ticker !== old && p.ticker !== next), newEntry])

    // User records: rename ticker (no-op when old === next). These are the
    // user's own facts (buys, manual dividends, watchlist, portfolio links)
    // and should survive a metadata fix-up.
    renameInKey('rmoney_stock_transactions', old, next)
    renameInKey('rmoney_dividends', old, next)
    renameInKey('rmoney_watchlist_entries', old, next)
    renameInKey('rmoney_portfolio_assignments', old, next)
    renameManualPricesTicker(old, next)

    // API caches: drop the wrong-identity data so it doesn't bleed through.
    deleteApiDividendHistoryForTicker(old)
    if (old !== next) deleteApiDividendHistoryForTicker(next)
  } else {
    // 'rename' — same company, symbol changed: carry over old entry, merge
    // resolved fields, key under the new ticker.
    const { ticker: _drop, ...oldFields } = oldProfile ?? { taxPercentOverride: null }
    const newEntry = { ...oldFields, ...resolvedFields, ...confirmFields, ticker: next }
    save([...profiles.filter(p => p.ticker !== old && p.ticker !== next), newEntry])

    renameInKey('rmoney_stock_transactions', old, next)
    renameInKey('rmoney_dividends', old, next)
    renameInKey('rmoney_watchlist_entries', old, next)
    renameInKey('rmoney_portfolio_assignments', old, next)
    renameApiDividendHistoryTicker(old, next)
    renameManualPricesTicker(old, next)
  }

  // Clear cached price / profile / news / intraday for the old ticker in both modes
  clearCacheForTicker(old)
}

function renameInKey(storageKey, old, next) {
  if (old === next) return
  try {
    const arr = JSON.parse(localStorage.getItem(storageKey)) ?? []
    localStorage.setItem(storageKey, JSON.stringify(
      arr.map(r => r.ticker === old ? { ...r, ticker: next } : r)
    ))
  } catch { /* corrupt JSON in localStorage — leave untouched */ }
}
