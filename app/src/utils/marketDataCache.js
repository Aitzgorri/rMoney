// HOT CACHE — short TTL; freely rebuildable on next load.
// Cleared without consequence; excluded from both Sharable and Full backups.
// Contrast with PERSISTED HISTORY (data/apiDividendHistory.js) which has no TTL, is rate-limited to
// refetch, and is included in Full backups.
//
// Invariant: stores only normalised response data (price, rate, text).
// NEVER stores API URLs, API keys, or any credential material.
import { getApiCacheTtl } from '../data/settings'
import { clearForexCache } from './currency'

const CACHE_KEY = 'rmoney_market_data_cache'
// Profiles cached indefinitely — only cleared by explicit refresh action

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {} } catch { return {} }
}

function saveCache(c) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(c))
}

function cacheKey(ticker, exchange) {
  return exchange
    ? `${ticker.toUpperCase()}:${exchange.toUpperCase()}`
    : ticker.toUpperCase()
}

// ─── Price cache ─────────────────────────────────────────────────────────────

export function getCachedPrice(ticker, exchange) {
  const entry = loadCache().prices?.[cacheKey(ticker, exchange)]
  if (!entry) return null
  const ttlMs = getApiCacheTtl().pricesMin * 60_000
  if (Date.now() - new Date(entry.fetchedAt).getTime() > ttlMs) return null
  return entry
}

export function getCachedPriceStale(ticker, exchange) {
  return loadCache().prices?.[cacheKey(ticker, exchange)] ?? null
}

export function setCachedPrice(ticker, exchange, data) {
  const k = cacheKey(ticker, exchange)
  const c = loadCache()
  saveCache({ ...c, prices: { ...(c.prices ?? {}), [k]: { ...data, fetchedAt: new Date().toISOString() } } })
}

export function clearPriceCache() {
  const c = loadCache()
  saveCache({ ...c, prices: {} })
}

export function clearNewsCache() {
  const c = loadCache()
  saveCache({ ...c, news: {} })
}

export function clearProfileCache() {
  const c = loadCache()
  saveCache({ ...c, profiles: {} })
}

// Clears all hot caches at once — call when credentials change.
export function clearAllMarketCaches() {
  saveCache({ prices: {}, news: {}, profiles: {}, intraday: {} })
}

// ─── News cache ───────────────────────────────────────────────────────────────

export function getCachedNews(ticker) {
  const entry = loadCache().news?.[ticker.toUpperCase()]
  if (!entry) return null
  const ttlMs = getApiCacheTtl().newsMin * 60_000
  if (Date.now() - new Date(entry.fetchedAt).getTime() > ttlMs) return null
  return entry.items
}

export function getCachedNewsStale(ticker) {
  return loadCache().news?.[ticker.toUpperCase()]?.items ?? null
}

export function setCachedNews(ticker, items) {
  const c = loadCache()
  saveCache({
    ...c,
    news: { ...(c.news ?? {}), [ticker.toUpperCase()]: { items, fetchedAt: new Date().toISOString() } },
  })
}

// ─── Intraday cache (5-min TTL) ───────────────────────────────────────────────

export function getCachedIntraday(ticker, exchange) {
  const entry = loadCache().intraday?.[cacheKey(ticker, exchange)]
  if (!entry) return null
  const ttlMs = getApiCacheTtl().intradayMin * 60_000
  if (Date.now() - new Date(entry.fetchedAt).getTime() > ttlMs) return null
  return entry.points
}

export function getCachedIntradayStale(ticker, exchange) {
  return loadCache().intraday?.[cacheKey(ticker, exchange)]?.points ?? null
}

export function setCachedIntraday(ticker, exchange, points) {
  const k = cacheKey(ticker, exchange)
  const c = loadCache()
  saveCache({ ...c, intraday: { ...(c.intraday ?? {}), [k]: { points, fetchedAt: new Date().toISOString() } } })
}

// ─── Profile cache (indefinite) ───────────────────────────────────────────────

export function getCachedMarketProfile(ticker) {
  return loadCache().profiles?.[ticker.toUpperCase()] ?? null
}

export function setCachedMarketProfile(ticker, profile) {
  const c = loadCache()
  saveCache({ ...c, profiles: { ...(c.profiles ?? {}), [ticker.toUpperCase()]: profile } })
}

export function clearCachedMarketProfile(ticker) {
  const c = loadCache()
  const profiles = { ...(c.profiles ?? {}) }
  delete profiles[ticker.toUpperCase()]
  saveCache({ ...c, profiles })
}

export function clearCacheForTicker(ticker) {
  const t = ticker.trim().toUpperCase()
  const c = loadCache()
  if (c.prices) {
    c.prices = Object.fromEntries(
      Object.entries(c.prices).filter(([k]) => k !== t && !k.startsWith(t + ':'))
    )
  }
  if (c.intraday) {
    c.intraday = Object.fromEntries(
      Object.entries(c.intraday).filter(([k]) => k !== t && !k.startsWith(t + ':'))
    )
  }
  if (c.profiles) delete c.profiles[t]
  if (c.news)     delete c.news[t]
  saveCache(c)
}

// ─── Page cache reset ─────────────────────────────────────────────────────────

const PAGE_CACHE_DEPS = {
  'investments':        ['prices', 'forex'],
  'stock-page':         ['prices', 'intraday', 'news'],
  'stock-inventory':    ['prices'],
  'dividend-page':      ['prices', 'forex'],
  'investment-reports': ['prices', 'forex'],
  'buy-sell-planning':  ['prices', 'forex'],
}

// Clears only the hot-cache buckets the given page depends on.
// Forex lives in a separate localStorage key (currency.js) — cleared via import.
// Does NOT touch apiDividendHistory (persisted, rate-limited).
export function resetPageCaches(pageId) {
  const deps = PAGE_CACHE_DEPS[pageId] ?? []
  const c = loadCache()
  const updated = { ...c }
  if (deps.includes('prices'))   updated.prices   = {}
  if (deps.includes('news'))     updated.news     = {}
  if (deps.includes('intraday')) updated.intraday = {}
  if (deps.includes('profiles')) updated.profiles = {}
  saveCache(updated)
  if (deps.includes('forex')) clearForexCache()
}

// ─── Storage info ─────────────────────────────────────────────────────────────

export function getCacheStorageBytes() {
  return new Blob([localStorage.getItem(CACHE_KEY) ?? '{}']).size
}

export function getCacheStats() {
  const c = loadCache()
  return {
    priceEntries:    Object.keys(c.prices   ?? {}).length,
    newsEntries:     Object.keys(c.news     ?? {}).length,
    profileEntries:  Object.keys(c.profiles ?? {}).length,
    intradayEntries: Object.keys(c.intraday ?? {}).length,
    bytes: getCacheStorageBytes(),
  }
}
