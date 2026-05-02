const CACHE_KEY = 'rmoney_exchange_rates'
const TTL_MS = 60 * 60 * 1000

export const SUPPORTED_CURRENCIES = [
  'AUD', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP',
  'HUF', 'JPY', 'NOK', 'PLN', 'SEK', 'USD',
]

export function inferLocaleCurrency() {
  const locale = (navigator.language || 'en-US').toLowerCase()
  if (locale.startsWith('cs')) return 'CZK'
  if (locale === 'en-us') return 'USD'
  if (locale === 'en-gb') return 'GBP'
  if (locale === 'en-ca') return 'CAD'
  if (locale === 'en-au') return 'AUD'
  if (locale.startsWith('ja')) return 'JPY'
  if (locale.startsWith('zh')) return 'CNY'
  if (locale.startsWith('pl')) return 'PLN'
  if (locale.startsWith('hu')) return 'HUF'
  if (locale.startsWith('no') || locale.startsWith('nb') || locale.startsWith('nn')) return 'NOK'
  if (locale.startsWith('sv')) return 'SEK'
  if (locale.startsWith('da')) return 'DKK'
  return 'EUR'
}

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? null
  } catch {
    return null
  }
}

function saveCache(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data))
}

function isCacheValid(cache, baseCurrency) {
  if (!cache || !cache.fetchedAt || cache.baseCurrency !== baseCurrency) return false
  return Date.now() - new Date(cache.fetchedAt).getTime() < TTL_MS
}

export async function fetchRates(baseCurrency) {
  const resp = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`)
  if (!resp.ok) throw new Error(`Rate fetch failed: ${resp.status}`)
  const data = await resp.json()
  if (data.result !== 'success') throw new Error(`Rate fetch error: ${data['error-type'] ?? 'unknown'}`)
  const cache = {
    baseCurrency,
    rates: data.rates,
    fetchedAt: new Date().toISOString(),
  }
  saveCache(cache)
  return cache
}

// Returns cached rates if still valid for baseCurrency, otherwise fetches fresh.
export async function ensureRates(baseCurrency, forceRefresh = false) {
  const cache = loadCache()
  if (!forceRefresh && isCacheValid(cache, baseCurrency)) return cache
  return fetchRates(baseCurrency)
}

export function getCachedRates() {
  return loadCache()
}

export function getRatesLastFetchedAt() {
  return loadCache()?.fetchedAt ?? null
}

// Converts `amount` from `fromCurrency` to `mainCurrency` using the current cache.
// Returns null when the cache is missing, stale, or lacks the needed rate — never silently falls back.
// When fromCurrency === mainCurrency, returns amount unchanged (no cache needed).
export function convertToMain(amount, fromCurrency, mainCurrency) {
  if (fromCurrency === mainCurrency) return amount
  const cache = loadCache()
  if (!cache || !isCacheValid(cache, mainCurrency)) return null
  const rate = cache.rates[fromCurrency]
  if (rate == null || rate === 0) return null
  // cache.rates[X] = how many X per 1 mainCurrency, so amount/rate = amount in mainCurrency
  return amount / rate
}

export function formatRatesTimestamp(fetchedAt) {
  if (!fetchedAt) return null
  return new Date(fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
