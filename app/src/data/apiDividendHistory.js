// PERSISTED HISTORY — no TTL; expensive to refetch (rate-limited APIs).
// Included in Full backup; excluded from Sharable backup.
// Not cleared without user action. Surfaced in Settings → Storage with per-ticker breakdown.
//
// Records are deduped on (ticker, exDate) — a later fetch overwrites an earlier one for the same date,
// except declared future rows with all fields present (skip rule — item 270).
//
// Schema: { ticker, exDate, payDate, perShare, currency, type, state, source, fetchedAt }
//   type:   'regular' | 'special' | null  (filled in Phase 25d; null from API for now)
//   state:  'paid' | 'declared' | null
//   source: 'api' | 'manual'

import { getDividends as apiGetDividends } from './marketDataClient'
import { upsertStockProfile, getStockProfile } from './stockProfiles'
import appStorage from '../utils/appStorage'

const KEY = 'rmoney_api_dividend_history'
const META_KEY = 'rmoney_api_dividend_history_meta'

function load() {
  try { return JSON.parse(appStorage.getItem(KEY)) ?? [] } catch { return [] }
}

function save(records) {
  appStorage.setItem(KEY, JSON.stringify(records))
}

function loadMeta() {
  try { return JSON.parse(appStorage.getItem(META_KEY)) ?? {} } catch { return {} }
}

function saveMeta(meta) {
  appStorage.setItem(META_KEY, JSON.stringify(meta))
}

// ── Per-ticker refresh metadata ───────────────────────────────────────────────

export function getRefreshMeta(ticker) {
  return loadMeta()[ticker.toUpperCase()] ?? null
}

function setRefreshMeta(ticker, meta) {
  const all = loadMeta()
  all[ticker.toUpperCase()] = meta
  saveMeta(all)
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getApiDividendHistory() {
  return load()
}

export function getApiDividendHistoryForTicker(ticker) {
  const t = ticker.toUpperCase()
  return load().filter(r => r.ticker === t)
}

// ── Write ─────────────────────────────────────────────────────────────────────

// Upsert schema-shaped records for a ticker, deduping on exDate.
// Skip rule (item 270): an existing row with state='declared', a future exDate, and
// all of payDate + perShare + currency present is preserved — it represents a
// user-confirmed or previously-declared dividend that should not be overwritten by
// a fresh API fetch that may lack the same detail.
export function upsertApiDividends(ticker, records) {
  const t = ticker.toUpperCase()
  const today = new Date().toISOString().slice(0, 10)
  const all = load()
  const kept = all.filter(r => r.ticker !== t)
  const existing = all.filter(r => r.ticker === t)
  const byExDate = Object.fromEntries(existing.map(r => [r.exDate, r]))

  for (const rec of records) {
    const prev = byExDate[rec.exDate]
    if (
      prev &&
      prev.state === 'declared' &&
      prev.exDate > today &&
      prev.payDate != null && prev.perShare != null && prev.currency != null
    ) {
      continue
    }
    byExDate[rec.exDate] = { ...rec, ticker: t }
  }

  save([...kept, ...Object.values(byExDate)])
}

// ── Delete by ticker ──────────────────────────────────────────────────────────

// Removes all persisted records for a ticker and clears its refresh metadata.
// Called by Stock inventory permanent-delete flow (Phase 30) and by
// renameTicker() in 'remap' mode (Phase 32j).
export function deleteApiDividendHistoryForTicker(ticker) {
  const t = ticker.toUpperCase()
  save(load().filter(r => r.ticker !== t))
  const meta = loadMeta()
  delete meta[t]
  saveMeta(meta)
}

// Rewrites the ticker field on every history row and migrates the refresh-meta
// entry from old → new. Called by renameTicker() in 'rename' mode (Phase 32j) —
// fixes a latent bug where API-fetched dividend history was orphaned under the
// old ticker after a rename.
export function renameApiDividendHistoryTicker(oldTicker, newTicker) {
  const o = oldTicker.toUpperCase()
  const n = newTicker.toUpperCase()
  if (o === n) return
  save(load().map(r => r.ticker === o ? { ...r, ticker: n } : r))
  const meta = loadMeta()
  if (meta[o]) {
    meta[n] = meta[o]
    delete meta[o]
    saveMeta(meta)
  }
}

// ── Stale indicator ───────────────────────────────────────────────────────────

// True when the ticker has never been successfully refreshed, or the last refresh failed.
// A successful refresh with zero results (stock pays no dividends) is NOT stale.
export function isStaleForTicker(ticker) {
  const meta = getRefreshMeta(ticker.toUpperCase())
  if (!meta) return true          // never fetched
  if (meta.failed) return true    // last attempt errored
  return false
}

// ── Refresh ───────────────────────────────────────────────────────────────────

// Fetch dividend history from the market data provider chain and persist results.
// Does not touch the user `dividends` collection.
//
// Defensive filter (Phase 32j): some provider adapters (Massive, TwelveData,
// AlphaVantage as of 2026-05) ignore the `exchange` parameter on getDividends
// and return the US-listed company's dividends for any bare ticker. When the
// stock profile has a known currency and the returned records use a different
// one, those records are almost certainly the wrong company's data — drop
// them. Profiles without a known currency get all records (we can't tell).
export async function refreshApiDividendHistory(ticker, exchange) {
  const t = ticker.toUpperCase()
  const today = new Date().toISOString().slice(0, 10)
  const fromDate = new Date(Date.now() - 10 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const toDate   = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  try {
    const raw = await apiGetDividends(t, exchange, fromDate, toDate)
    if (!Array.isArray(raw)) throw new Error('no data')

    const profileCurrency = getStockProfile(t)?.currency?.toUpperCase() ?? null
    const accepted = profileCurrency
      ? raw.filter(d => !d.currency || d.currency.toUpperCase() === profileCurrency)
      : raw
    const droppedCount = raw.length - accepted.length
    if (droppedCount > 0) {
      console.warn(`[apiDividendHistory] Dropped ${droppedCount} of ${raw.length} dividend records for ${t}: currency mismatch with profile (${profileCurrency}). Provider likely returned the wrong listing's data.`)
    }

    const fetchedAt = new Date().toISOString()
    const mapped = accepted.map(d => ({
      ticker:    t,
      exDate:    d.exDate,
      payDate:   d.paymentDate ?? null,
      perShare:  d.amount,
      currency:  d.currency,
      type:      d.type ?? null,
      state:     (d.paymentDate ?? d.exDate) < today ? 'paid' : 'declared',
      source:    'api',
      fetchedAt,
    }))

    upsertApiDividends(t, mapped)

    // Write dividendFrequency to the stock profile when the provider supplies it.
    // Use the most common non-null frequency across all *accepted* records.
    const freqCounts = {}
    for (const d of accepted) {
      if (d.frequency) freqCounts[d.frequency] = (freqCounts[d.frequency] ?? 0) + 1
    }
    const topFreq = Object.entries(freqCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    if (topFreq) {
      const updates = { dividendFrequency: topFreq }
      // Phase 38 (SPEC-020 item 430): a confirmed cadence implies the stock pays
      // dividends. Auto-tag paysDividends only from null/unknown — never override
      // a user's explicit `false`, and no-op when already true.
      if (topFreq !== 'unknown') {
        const prof = getStockProfile(t)
        if (prof?.paysDividends == null) updates.paysDividends = true
      }
      upsertStockProfile(t, updates)
    }

    setRefreshMeta(t, { lastRefreshedAt: fetchedAt, failed: false, exchange: exchange ?? null })
  } catch (err) {
    setRefreshMeta(t, { lastRefreshedAt: null, failed: true, exchange: exchange ?? null })
    throw err
  }
}

// ── Clear / storage stats ─────────────────────────────────────────────────────

export function clearApiDividendHistory() {
  save([])
  appStorage.removeItem(META_KEY)
}

export function getApiDividendHistoryStorageBytes() {
  return new Blob([appStorage.getItem(KEY) ?? '[]']).size
}

export function getApiDividendHistoryStats() {
  const records = load()
  const byTicker = {}
  for (const r of records) {
    if (!byTicker[r.ticker]) byTicker[r.ticker] = []
    byTicker[r.ticker].push(r)
  }
  const perTicker = Object.entries(byTicker)
    .map(([ticker, rows]) => ({
      ticker,
      count: rows.length,
      bytes: new Blob([JSON.stringify(rows)]).size,
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
  return {
    tickerCount: perTicker.length,
    recordCount: records.length,
    bytes: getApiDividendHistoryStorageBytes(),
    perTicker,
  }
}
