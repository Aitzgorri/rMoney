// PERSISTED HISTORY — no TTL; expensive to refetch (rate-limited APIs).
// Included in Full backup; excluded from Sharable backup.
// Not cleared without user action. Surfaced in Settings → Storage with per-ticker breakdown.
//
// Records are deduped on (ticker, exDate) — a later fetch overwrites an earlier one for the same date.
// Schema (set in Phase 25c when the API integration writes here):
//   { ticker, exDate, payDate, perShare, currency, type, state, source, fetchedAt }

const KEY = 'rmoney_api_dividend_history'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] }
}

function save(records) {
  localStorage.setItem(KEY, JSON.stringify(records))
}

export function getApiDividendHistory() {
  return load()
}

export function clearApiDividendHistory() {
  save([])
}

export function getApiDividendHistoryStorageBytes() {
  return new Blob([localStorage.getItem(KEY) ?? '[]']).size
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
    .sort((a, b) => b.bytes - a.bytes)
  return {
    tickerCount: perTicker.length,
    recordCount: records.length,
    bytes: getApiDividendHistoryStorageBytes(),
    perTicker,
  }
}
