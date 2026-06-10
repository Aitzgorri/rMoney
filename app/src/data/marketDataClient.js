import { getMarketDataProviders } from './settings'
import { getSecret } from '../utils/secrets'
import { getManualPrice, isManualStock, getStockProfile, upsertStockProfile } from './stockProfiles'
import { getLatestManualPrice, getManualPricesForTicker } from './manualPrices'
import {
  getCachedPrice, setCachedPrice, getCachedPriceStale,
  getCachedNews, setCachedNews, getCachedNewsStale,
  getCachedMarketProfile, setCachedMarketProfile,
  getCachedIntraday, setCachedIntraday, getCachedIntradayStale,
  getCachedHistorical, setCachedHistorical, getCachedHistoricalStale,
  isCoolingDown, setCooldown, clearCooldown,
} from '../utils/marketDataCache'
import { logCall, sanitiseReason } from '../utils/marketDataLogger'
import { ibkr }         from '../services/providers/ibkr'
import { yahooFinance } from '../services/providers/yahooFinance'
import { massive }      from '../services/providers/massive'
import { twelveData }   from '../services/providers/twelveData'
import { finnhub }      from '../services/providers/finnhub'
import { alphaVantage } from '../services/providers/alphaVantage'
import { stooq }        from '../services/providers/stooq'
import { coingecko }    from '../services/providers/coingecko'

// Chain order: IBKR → Yahoo Finance → Massive → Twelve Data → Finnhub → Alpha Vantage → Stooq
const CHAIN = [
  { id: 'ibkr',         provider: ibkr },
  { id: 'yahooFinance', provider: yahooFinance },
  { id: 'massive',      provider: massive },
  { id: 'twelveData',   provider: twelveData },
  { id: 'finnhub',      provider: finnhub },
  { id: 'alphaVantage', provider: alphaVantage },
  { id: 'stooq',        provider: stooq },
]

// Module-level deduplication — if two callers request the same key while a
// call is already in flight, they share one promise and one network round-trip.
const _inFlight = new Map()

function dedup(key, fn) {
  if (_inFlight.has(key)) return _inFlight.get(key)
  const p = Promise.resolve().then(fn).finally(() => _inFlight.delete(key))
  _inFlight.set(key, p)
  return p
}

// Build provider config, fetching API key from vault if apiKeySet.
async function buildProviderCfg(id, baseCfg) {
  if (!baseCfg?.apiKeySet) return baseCfg ?? {}
  const apiKey = await getSecret(`marketData/${id}/apiKey`)
  return { ...baseCfg, apiKey }
}

// Try every enabled provider in chain order, log each attempt immediately.
// Returns { result, providerName } or throws 'unavailable'.
async function callChain(methodName, methodArgs) {
  const cfg = getMarketDataProviders()
  const active = CHAIN.filter(({ id }) => cfg[id]?.enabled)
  if (active.length === 0) throw new Error('unavailable')

  for (const { id, provider } of active) {
    const start = Date.now()
    try {
      const providerCfg = await buildProviderCfg(id, cfg[id])
      const result = await provider[methodName](...methodArgs, providerCfg)
      logCall({ callType: methodName, args: methodArgs, providerName: id, latencyMs: Date.now() - start, outcome: 'success', reason: null })
      return { result, providerName: id }
    } catch (err) {
      logCall({ callType: methodName, args: methodArgs, providerName: id, latencyMs: Date.now() - start, outcome: 'failure', reason: err.message })
    }
  }

  throw new Error('unavailable')
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Returns { price, currency, asOf, providerName }
export function getLatestPrice(ticker, exchange, { forceRefresh = false } = {}) {
  const t = ticker.toUpperCase()

  // Manual stocks: no provider call — read the latest user-entered price.
  if (isManualStock(t)) {
    const latest = getLatestManualPrice(t)
    if (latest) return Promise.resolve({ price: latest.price, currency: latest.currency, asOf: latest.date, providerName: 'manual-stock' })
    return Promise.reject(new Error('no manual price set'))
  }

  const manual = getManualPrice(t)
  if (manual) return Promise.resolve({ price: manual.amount, currency: manual.currency, asOf: manual.setAt, providerName: 'manual' })

  if (!forceRefresh) {
    const cached = getCachedPrice(t, exchange)
    if (cached) return Promise.resolve(cached)
    if (isCoolingDown('prices', t, exchange)) {
      logCall({ callType: 'getLatestPrice', args: [t, exchange], providerName: null, latencyMs: 0, outcome: 'cooldown-skip', reason: null })
      const stale = getCachedPriceStale(t, exchange)
      if (stale) return Promise.resolve({ ...stale, providerName: 'stale-cache', isStale: true })
      const lkp = getStockProfile(t)?.lastKnownPrice
      if (lkp) return Promise.resolve({ price: lkp.amount, currency: lkp.currency, asOf: lkp.fetchedAt, providerName: 'lastKnownPrice', isStale: true })
      return Promise.reject(new Error('unavailable (cooldown)'))
    }
  }

  return dedup(`price:${t}:${exchange ?? ''}`, async () => {
    try {
      const { result, providerName } = await callChain('getLatestPrice', [t, exchange])
      const entry = { ...result, providerName }
      setCachedPrice(t, exchange, entry)
      clearCooldown('prices', t, exchange)
      // Persist as lastKnownPrice so offline renders can fall back to it.
      // Guard: only update an existing profile — never create one here.
      if (getStockProfile(t)) {
        upsertStockProfile(t, {
          lastKnownPrice: { amount: result.price, currency: result.currency, fetchedAt: new Date().toISOString() },
        })
      }
      return entry
    } catch (err) {
      setCooldown('prices', t, exchange)
      const stale = getCachedPriceStale(t, exchange)
      if (stale) return { ...stale, providerName: 'stale-cache', isStale: true }
      const lkp = getStockProfile(t)?.lastKnownPrice
      if (lkp) {
        return { price: lkp.amount, currency: lkp.currency, asOf: lkp.fetchedAt, providerName: 'lastKnownPrice', isStale: true }
      }
      throw err
    }
  })
}

// Returns [{ time, close }] — intraday 1-min bars for today's session; hot-cached with 5-min TTL
export function getIntradaySeries(ticker, exchange, { forceRefresh = false } = {}) {
  const t = ticker.toUpperCase()

  // Manual stocks: no intraday data — reject so the chart falls through to "unavailable"
  if (isManualStock(t)) return Promise.reject(new Error('not supported for manual stocks'))

  if (!forceRefresh) {
    const cached = getCachedIntraday(t, exchange)
    if (cached) return Promise.resolve(cached)
    if (isCoolingDown('intraday', t, exchange)) {
      logCall({ callType: 'getIntradaySeries', args: [t, exchange], providerName: null, latencyMs: 0, outcome: 'cooldown-skip', reason: null })
      const stale = getCachedIntradayStale(t, exchange)
      if (stale) return Promise.resolve(stale)
      return Promise.reject(new Error('unavailable (cooldown)'))
    }
  }

  return dedup(`intraday:${t}:${exchange ?? ''}`, async () => {
    try {
      const { result } = await callChain('getIntradaySeries', [t, exchange])
      setCachedIntraday(t, exchange, result)
      clearCooldown('intraday', t, exchange)
      return result
    } catch (err) {
      setCooldown('intraday', t, exchange)
      const stale = getCachedIntradayStale(t, exchange)
      if (stale) return stale
      throw err
    }
  })
}

// Returns [{ date, close }]. Cached with a 12-hour TTL (marketDataCache) so EOD
// series already received aren't re-fetched — this matters for Stooq, whose
// historical endpoint enforces a tight per-IP daily download quota.
export function getHistoricalSeries(ticker, exchange, period, resolution, { forceRefresh = false } = {}) {
  const t = ticker.toUpperCase()

  // Manual stocks: synthesize the series from user-entered manual prices.
  if (isManualStock(t)) {
    const rows = getManualPricesForTicker(t)
    if (rows.length === 0) return Promise.reject(new Error('no manual price history'))
    // Sort ascending and pick rows in the requested period window.
    const asc = [...rows].reverse()
    const fromIso = isoNDaysAgo(period)
    const inWindow = fromIso ? asc.filter(r => r.date >= fromIso) : asc
    return Promise.resolve(inWindow.map(r => ({ date: r.date, close: r.price })))
  }

  if (!forceRefresh) {
    const cached = getCachedHistorical(t, exchange, period, resolution)
    if (cached) return Promise.resolve(cached)
    if (isCoolingDown('historical', t, exchange)) {
      logCall({ callType: 'getHistoricalSeries', args: [t, exchange, period, resolution], providerName: null, latencyMs: 0, outcome: 'cooldown-skip', reason: null })
      const stale = getCachedHistoricalStale(t, exchange, period, resolution)
      if (stale) return Promise.resolve(stale)
      return Promise.reject(new Error('unavailable (cooldown)'))
    }
  }

  return dedup(`series:${t}:${exchange ?? ''}:${period}:${resolution}`, async () => {
    try {
      const { result } = await callChain('getHistoricalSeries', [t, exchange, period, resolution])
      setCachedHistorical(t, exchange, period, resolution, result)
      clearCooldown('historical', t, exchange)
      return result
    } catch (err) {
      setCooldown('historical', t, exchange)
      const stale = getCachedHistoricalStale(t, exchange, period, resolution)
      if (stale) return stale
      throw err
    }
  })
}

function isoNDaysAgo(period) {
  const map = { '1M': 31, '3M': 93, '6M': 186, '1Y': 366, '5Y': 1830 }
  const days = map[period]
  if (!days) return null  // 'All' or unknown — return all rows
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10)
}

// Returns [{ exDate, amount, currency, paymentDate? }]
export async function getDividends(ticker, exchange, fromDate, toDate) {
  const t = ticker.toUpperCase()
  // Manual stocks have no API-driven dividend feed — user-recorded dividends
  // (in the `dividends` collection) are the only source for these tickers.
  if (isManualStock(t)) return []
  const { result } = await callChain('getDividends', [t, exchange ?? null, fromDate, toDate])
  return result
}

// Returns [{ date, type, ratio? }]
export async function getCorporateActions(ticker, fromDate) {
  const t = ticker.toUpperCase()
  if (isManualStock(t)) return []
  const { result } = await callChain('getCorporateActions', [t, fromDate])
  return result
}

// Returns { items: [{ headline, source, url, publishedAt }], providerName }
export function getNews(ticker, limit = 5, { forceRefresh = false } = {}) {
  const t = ticker.toUpperCase()

  // Manual stocks have no news feed — return empty list so the section hides.
  if (isManualStock(t)) return Promise.resolve({ items: [], providerName: 'manual-stock' })

  if (!forceRefresh) {
    const cached = getCachedNews(t)
    if (cached) return Promise.resolve({ items: cached, providerName: 'cache' })
    if (isCoolingDown('news', t, null)) {
      logCall({ callType: 'getNews', args: [t, limit], providerName: null, latencyMs: 0, outcome: 'cooldown-skip', reason: null })
      const stale = getCachedNewsStale(t)
      if (stale) return Promise.resolve({ items: stale, providerName: 'stale-cache', isStale: true })
      return Promise.reject(new Error('unavailable (cooldown)'))
    }
  }

  return dedup(`news:${t}:${limit}`, async () => {
    try {
      const { result, providerName } = await callChain('getNews', [t, limit])
      const items = Array.isArray(result) ? result : result.items ?? []
      setCachedNews(t, items)
      clearCooldown('news', t, null)
      return { items, providerName }
    } catch (err) {
      setCooldown('news', t, null)
      const stale = getCachedNewsStale(t)
      if (stale) return { items: stale, providerName: 'stale-cache', isStale: true }
      throw err
    }
  })
}

// Returns { rate, asOf } — caching is owned by SPEC-017 (currency.js); client just fetches
export async function getForex(fromCurrency, toCurrency) {
  const { result } = await callChain('getForex', [fromCurrency, toCurrency])
  return result
}

// Returns { rate, date }
export async function getHistoricalForex(fromCurrency, toCurrency, date) {
  const { result } = await callChain('getHistoricalForex', [fromCurrency, toCurrency, date])
  return result
}

// Returns [{ date, close }]
export async function getIndexSeries(indexTicker, period, resolution) {
  const { result } = await callChain('getIndexSeries', [indexTicker.toUpperCase(), period, resolution])
  return result
}

// Returns { name, exchanges, hqCountry, currency, providerName }
// Pass exchange (MIC code or display name) so adapters can qualify the ticker
// for non-US listings (e.g. 'VNA' + 'XETR' → Yahoo Finance uses 'VNA.DE').
export function getMarketProfile(ticker, exchange, { forceRefresh = false } = {}) {
  const t = ticker.toUpperCase()
  const ex = exchange ?? null

  if (!forceRefresh) {
    const cached = getCachedMarketProfile(t)
    if (cached) return Promise.resolve(cached)
  }

  return dedup(`profile:${t}:${ex ?? ''}`, async () => {
    const { result, providerName } = await callChain('getStockProfile', [t, ex])
    const entry = { ...result, providerName }
    setCachedMarketProfile(t, entry)
    return entry
  })
}

// Returns merged candidates from every enabled provider that supports search.
// Unlike price calls (stop at first success), this calls ALL providers and unions
// the results — different providers cover different regions and exchanges.
// Each candidate: { ticker, name, exchange (MIC), currency (major-unit), source (display string) }
export function searchSymbols(query) {
  return dedup(`search:${query}`, () => _searchSymbols(query))
}

async function _searchSymbols(query) {
  const cfg = getMarketDataProviders()
  const active = CHAIN.filter(({ id }) => cfg[id]?.enabled)

  const perProvider = await Promise.allSettled(
    active.map(async ({ id, provider }) => {
      const start = Date.now()
      try {
        const providerCfg = await buildProviderCfg(id, cfg[id])
        const results = await provider.searchSymbols(query, providerCfg)
        logCall({ callType: 'searchSymbols', args: [query], providerName: id, latencyMs: Date.now() - start, outcome: 'success', reason: null })
        return results
      } catch (err) {
        logCall({ callType: 'searchSymbols', args: [query], providerName: id, latencyMs: Date.now() - start, outcome: 'failure', reason: err.message })
        return []
      }
    })
  )

  // Merge by canonical (ticker, exchange, currency) triple.
  // Candidates that share the triple from multiple providers are coalesced into one
  // row; their source strings are concatenated so the UI can show "from Yahoo + Massive".
  const merged = new Map()
  for (const settled of perProvider) {
    if (settled.status !== 'fulfilled') continue
    for (const c of settled.value) {
      const key = `${c.ticker}|${c.exchange ?? ''}|${c.currency ?? ''}`
      if (merged.has(key)) {
        const ex = merged.get(key)
        if (!ex.source.includes(c.source)) ex.source += ' + ' + c.source
        if (!ex.name && c.name) ex.name = c.name
      } else {
        merged.set(key, { ticker: c.ticker, name: c.name, exchange: c.exchange, currency: c.currency, source: c.source })
      }
    }
  }

  return Array.from(merged.values())
}

// ─── Crypto resolution + pricing (SPEC-036 / SPEC-029) ─────────────────────────

// Returns { price, currency, asOf, providerName } — current crypto price in `vsCurrency`.
// Crypto-only: calls CoinGecko directly (not the stock chain). Hot-cached via the existing
// price cache, namespaced by `crypto:<vs>` in the exchange slot so it never collides with a
// stock quote for the same ticker. `coinId` (from cryptoProfiles) prices the exact coin;
// without it the adapter falls back to its highest-market-cap symbol guess.
export function getCryptoPrice(ticker, vsCurrency, coinId = null, { forceRefresh = false } = {}) {
  const t   = ticker.toUpperCase()
  const vs  = (vsCurrency ?? 'usd').toLowerCase()
  const key = `crypto:${vs}`

  if (!forceRefresh) {
    const cached = getCachedPrice(t, key)
    if (cached) return Promise.resolve(cached)
  }

  return dedup(`cryptoPrice:${t}:${vs}:${coinId ?? ''}`, async () => {
    try {
      const result = await coingecko.getLatestPrice(t, null, { vsCurrency: vs, coinId })
      const entry = { ...result, providerName: 'coingecko' }
      setCachedPrice(t, key, entry)
      return entry
    } catch (err) {
      const stale = getCachedPriceStale(t, key)
      if (stale) return { ...stale, providerName: 'stale-cache', isStale: true }
      throw err
    }
  })
}

// Returns [{ coinId, symbol, name, marketCapRank }] — candidate coins for a free-text
// query, so the user can disambiguate a crypto symbol (e.g. "BTC" → bitcoin) before it
// is stored on a holding. Crypto-only: calls CoinGecko directly, bypassing the stock
// provider chain (which is keyed on stock symbols/exchanges). Keyless, no logging of URLs.
export function searchCryptoCoins(query) {
  const q = (query ?? '').trim()
  if (!q) return Promise.resolve([])
  return dedup(`cryptoSearch:${q.toLowerCase()}`, () => coingecko.searchCoins(q))
}

// Convenience wrapper for callers that already have a stockProfile in hand
// (Phase 32e). When `profile.isManual === true`, every provider read is
// short-circuited to user-entered prices and an empty dividend feed — no
// network call. Returns the same shape as `getLatestPrice` so consumers can
// drop in. The standalone provider-chain functions above also self-gate on
// `isManualStock(ticker)`, so this helper is purely ergonomic: it skips the
// localStorage profile lookup the gate would otherwise perform.
//
// `profile` may be null/undefined — falls back to the standard chain.
export function getQuoteForProfile(profile, options = {}) {
  if (!profile?.ticker) return Promise.reject(new Error('profile missing ticker'))
  if (profile.isManual === true) {
    const latest = getLatestManualPrice(profile.ticker)
    if (latest) {
      return Promise.resolve({
        price: latest.price,
        currency: latest.currency,
        asOf: latest.date,
        providerName: 'manual-stock',
      })
    }
    return Promise.reject(new Error('no manual price set'))
  }
  return getLatestPrice(profile.ticker, profile.stockExchange ?? null, options)
}

// Tests a single named provider with a lightweight AAPL price call.
// Throws with a message if the provider fails.
export async function testProvider(id) {
  const cfg = getMarketDataProviders()
  const providerMap = { ibkr, yahooFinance, massive, twelveData, finnhub, alphaVantage, stooq }
  const provider = providerMap[id]
  if (!provider) throw new Error('Unknown provider')
  const start = Date.now()
  try {
    const providerCfg = await buildProviderCfg(id, cfg[id] ?? {})
    // Stooq's light-quote endpoint was removed upstream (hard 404); historical EOD
    // (behind a proof-of-work gate) is the only path it can still serve, so test that.
    if (id === 'stooq') {
      const rows = await provider.getHistoricalSeries('AAPL', null, '1M', '1D', providerCfg)
      if (!rows?.length) throw new Error('no data')
    } else {
      await provider.getLatestPrice('AAPL', null, providerCfg)
    }
    logCall({ callType: 'testProvider', args: [id], providerName: id, latencyMs: Date.now() - start, outcome: 'success', reason: null })
  } catch (err) {
    const safe = sanitiseReason(err.message)
    logCall({ callType: 'testProvider', args: [id], providerName: id, latencyMs: Date.now() - start, outcome: 'failure', reason: safe })
    throw new Error(safe ?? 'Connection failed')
  }
}
