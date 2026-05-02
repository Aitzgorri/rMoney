// Invariant: this cache stores only normalised response data (price, rate, text).
// It NEVER stores API URLs, API keys, or any credential material.
// Adapters strip credentials before returning; callChain passes only the result object here.
const CACHE_KEY = 'rmoney_market_data_cache'
const TTL_PRICES_MS = 60 * 60 * 1000       // 1 hour
const TTL_NEWS_MS   = 15 * 60 * 1000       // 15 minutes
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
  if (Date.now() - new Date(entry.fetchedAt).getTime() > TTL_PRICES_MS) return null
  return entry
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

// Clears all three caches at once — call when credentials change.
export function clearAllMarketCaches() {
  saveCache({ prices: {}, news: {}, profiles: {} })
}

// ─── News cache ───────────────────────────────────────────────────────────────

export function getCachedNews(ticker) {
  const entry = loadCache().news?.[ticker.toUpperCase()]
  if (!entry) return null
  if (Date.now() - new Date(entry.fetchedAt).getTime() > TTL_NEWS_MS) return null
  return entry.items
}

export function setCachedNews(ticker, items) {
  const c = loadCache()
  saveCache({
    ...c,
    news: { ...(c.news ?? {}), [ticker.toUpperCase()]: { items, fetchedAt: new Date().toISOString() } },
  })
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
  if (c.profiles) delete c.profiles[t]
  if (c.news)     delete c.news[t]
  saveCache(c)
}

// ─── Storage info ─────────────────────────────────────────────────────────────

export function getCacheStorageBytes() {
  return new Blob([localStorage.getItem(CACHE_KEY) ?? '{}']).size
}

export function getCacheStats() {
  const c = loadCache()
  return {
    priceEntries:   Object.keys(c.prices   ?? {}).length,
    newsEntries:    Object.keys(c.news     ?? {}).length,
    profileEntries: Object.keys(c.profiles ?? {}).length,
    bytes: getCacheStorageBytes(),
  }
}
