import { getHistoricalForex } from '../data/marketDataClient'
import appStorage from './appStorage'

const CACHE_KEY = 'rmoney_exchange_rates'

function getForexTtlMs() {
  // Read directly from appStorage to avoid a circular dep (settings.js → currency.js).
  try {
    const s = JSON.parse(appStorage.getItem('rmoney_settings')) ?? {}
    const min = s.apiCacheTtl?.forexMin
    return (Number.isFinite(min) && min > 0 ? min : 60) * 60_000
  } catch {
    return 60 * 60_000
  }
}

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
    return JSON.parse(appStorage.getItem(CACHE_KEY)) ?? null
  } catch {
    return null
  }
}

function saveCache(data) {
  appStorage.setItem(CACHE_KEY, JSON.stringify(data))
}

function isCacheValid(cache, baseCurrency) {
  if (!cache || !cache.fetchedAt || cache.baseCurrency !== baseCurrency) return false
  return Date.now() - new Date(cache.fetchedAt).getTime() < getForexTtlMs()
}

export function clearForexCache() {
  appStorage.removeItem(CACHE_KEY)
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

// Fetches the historical FX rate from `tradingCurrency` to `mainCurrency` at `date`.
// Returns { mainCurrency, rateToMain, capturedAt } or null if unavailable or an error occurs.
// Callers get mainCurrency from getMainCurrency() to avoid a circular dep (settings→currency).
export async function snapshotFxRates(tradingCurrency, date, mainCurrency) {
  if (!tradingCurrency || !date || !mainCurrency) return null
  const from = tradingCurrency.toUpperCase()
  const to = mainCurrency.toUpperCase()
  if (from === to) return { mainCurrency: to, rateToMain: 1, capturedAt: new Date().toISOString() }
  try {
    const result = await getHistoricalForex(from, to, date)
    if (!result?.rate) return null
    return { mainCurrency: to, rateToMain: result.rate, capturedAt: new Date().toISOString() }
  } catch {
    return null
  }
}

export function formatRatesTimestamp(fetchedAt) {
  if (!fetchedAt) return null
  return new Date(fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
