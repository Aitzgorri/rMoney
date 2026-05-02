const STORAGE_KEY = 'rmoney_market_data_log'
const MAX_ENTRIES = 100

// In-memory copy so repeated reads don't hit localStorage every time
let _cache = null

function load() {
  if (_cache !== null) return _cache
  try { _cache = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [] } catch { _cache = [] }
  return _cache
}

function persist(entries) {
  _cache = entries
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

// Strip URLs and API-key query params from error reasons before logging.
// Prevents accidental persistence of credentials in the call log.
// Exported so callChain and testProvider can sanitise before re-throwing.
export function sanitiseReason(msg) {
  if (!msg) return null
  return String(msg)
    .replace(/https?:\/\/\S*/gi, '[url]')
    .replace(/[?&](api[_-]?key|apikey|token|access_token)[^&\s]*/gi, '[key]')
    .slice(0, 200)
}

export function logCall({ callType, args, providerName, latencyMs, outcome, reason }) {
  const entry = {
    callType,
    args: args?.map(a => (a == null ? null : String(a))),
    providerName,
    latencyMs,
    outcome,    // 'success' | 'failure'
    reason: sanitiseReason(reason),
    timestamp: new Date().toISOString(),
  }
  // Invariant: reason must never contain raw credential material after sanitising.
  if (import.meta.env.DEV && entry.reason) {
    if (/apikey|api_key|token=/i.test(entry.reason)) {
      console.error('[marketDataLogger] INVARIANT VIOLATION — reason may contain credential material:', entry.reason.slice(0, 80))
    }
  }
  persist([entry, ...load()].slice(0, MAX_ENTRIES))
}

export function getCallLog() {
  return load()
}

export function clearCallLog() {
  persist([])
}

export function getLogStorageBytes() {
  return new Blob([localStorage.getItem(STORAGE_KEY) ?? '[]']).size
}
