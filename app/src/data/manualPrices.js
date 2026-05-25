// User-entered price records for manual stocks (SPEC-029 / Phase 32e).
// Each row is a snapshot the user explicitly typed in for a given date —
// keyed implicitly by (ticker, date). A later save for the same date
// overwrites the earlier value (treat ticker+date as the natural unique key).
//
// Lives alongside the existing per-stock `manualPrice` override on
// `stockProfiles`. The two are distinct:
//   - `stockProfile.manualPrice` is a single override that wins over the
//     provider chain for an otherwise API-backed stock (Phase 11c, item 155).
//   - `manualPrices` (this module) is a time-series for stocks with
//     `isManual: true`, where no provider data is ever consulted.
//
// Schema: { ticker, date, price, currency, setAt }
//   ticker:   uppercase symbol
//   date:     ISO yyyy-mm-dd — the as-of date for this price (set by the user)
//   price:    number
//   currency: ISO code (uppercase)
//   setAt:    ISO timestamp recording when the user saved the entry

const KEY = 'rmoney_manual_prices'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] }
}

function save(rows) {
  localStorage.setItem(KEY, JSON.stringify(rows))
}

// Returns every manual-price entry for a ticker, sorted newest-first by date.
export function getManualPricesForTicker(ticker) {
  const t = ticker.toUpperCase()
  return load()
    .filter(r => r.ticker === t)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

// Returns the most recent manual-price entry for a ticker, or null.
export function getLatestManualPrice(ticker) {
  return getManualPricesForTicker(ticker)[0] ?? null
}

// Returns the most recent manual price on or before `asOfDate`, or null.
// Used by historical lookups (chart series, snapshot rates, etc.) when the
// caller wants the price that was in force on a given date.
export function getManualPriceOnOrBefore(ticker, asOfDate) {
  return getManualPricesForTicker(ticker).find(r => r.date <= asOfDate) ?? null
}

// Upsert by (ticker, date). Later writes for the same day overwrite earlier ones.
export function setManualPriceEntry(ticker, date, price, currency) {
  const t = ticker.toUpperCase()
  const c = currency.trim().toUpperCase()
  const row = { ticker: t, date, price: Number(price), currency: c, setAt: new Date().toISOString() }
  const rows = load().filter(r => !(r.ticker === t && r.date === date))
  save([...rows, row])
}

export function deleteManualPriceEntry(ticker, date) {
  const t = ticker.toUpperCase()
  save(load().filter(r => !(r.ticker === t && r.date === date)))
}

// Removes every manual-price entry for a ticker. Called by the Stock-inventory
// permanent-delete flow (so the row's history doesn't outlive the profile).
export function deleteManualPricesForTicker(ticker) {
  const t = ticker.toUpperCase()
  save(load().filter(r => r.ticker !== t))
}

// Rewrites the ticker field on every manual-price row. Used by renameTicker
// (Phase 32e). Same-ticker calls are a no-op.
export function renameManualPricesTicker(oldTicker, newTicker) {
  const o = oldTicker.toUpperCase()
  const n = newTicker.toUpperCase()
  if (o === n) return
  save(load().map(r => r.ticker === o ? { ...r, ticker: n } : r))
}

// ─── Storage stats (Settings → Storage tab) ──────────────────────────────────

export function getManualPricesStorageBytes() {
  return new Blob([localStorage.getItem(KEY) ?? '[]']).size
}

export function getManualPricesStats() {
  const rows = load()
  const byTicker = {}
  for (const r of rows) {
    if (!byTicker[r.ticker]) byTicker[r.ticker] = []
    byTicker[r.ticker].push(r)
  }
  const perTicker = Object.entries(byTicker)
    .map(([ticker, items]) => ({
      ticker,
      count: items.length,
      bytes: new Blob([JSON.stringify(items)]).size,
    }))
    .sort((a, b) => b.bytes - a.bytes)
  return {
    tickerCount: perTicker.length,
    recordCount: rows.length,
    bytes: getManualPricesStorageBytes(),
    perTicker,
  }
}

export function clearAllManualPrices() {
  save([])
}
