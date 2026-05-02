import { getMarketDataProviders } from './settings'
import { getSecret } from '../utils/secrets'
import { getManualPrice } from './stockProfiles'
import {
  getCachedPrice, setCachedPrice,
  getCachedNews, setCachedNews,
  getCachedMarketProfile, setCachedMarketProfile,
} from '../utils/marketDataCache'
import { logCall, sanitiseReason } from '../utils/marketDataLogger'
import { ibkr }         from '../services/providers/ibkr'
import { yahooFinance } from '../services/providers/yahooFinance'
import { massive }      from '../services/providers/massive'
import { twelveData }   from '../services/providers/twelveData'
import { finnhub }      from '../services/providers/finnhub'
import { alphaVantage } from '../services/providers/alphaVantage'
import { stooq }        from '../services/providers/stooq'

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

  const manual = getManualPrice(t)
  if (manual) return Promise.resolve({ price: manual.amount, currency: manual.currency, asOf: manual.setAt, providerName: 'manual' })

  if (!forceRefresh) {
    const cached = getCachedPrice(t, exchange)
    if (cached) return Promise.resolve(cached)
  }

  return dedup(`price:${t}:${exchange ?? ''}`, async () => {
    const { result, providerName } = await callChain('getLatestPrice', [t, exchange])
    const entry = { ...result, providerName }
    setCachedPrice(t, exchange, entry)
    return entry
  })
}

// Returns [{ date, close }] — not cached in Phase 2
export function getHistoricalSeries(ticker, exchange, period, resolution) {
  const t = ticker.toUpperCase()
  return dedup(`series:${t}:${exchange ?? ''}:${period}:${resolution}`, async () => {
    const { result } = await callChain('getHistoricalSeries', [t, exchange, period, resolution])
    return result
  })
}

// Returns [{ exDate, amount, currency, paymentDate? }]
export async function getDividends(ticker, fromDate, toDate) {
  const { result } = await callChain('getDividends', [ticker.toUpperCase(), fromDate, toDate])
  return result
}

// Returns [{ date, type, ratio? }]
export async function getCorporateActions(ticker, fromDate) {
  const { result } = await callChain('getCorporateActions', [ticker.toUpperCase(), fromDate])
  return result
}

// Returns { items: [{ headline, source, url, publishedAt }], providerName }
export function getNews(ticker, limit = 5, { forceRefresh = false } = {}) {
  const t = ticker.toUpperCase()

  if (!forceRefresh) {
    const cached = getCachedNews(t)
    if (cached) return Promise.resolve({ items: cached, providerName: 'cache' })
  }

  return dedup(`news:${t}:${limit}`, async () => {
    const { result, providerName } = await callChain('getNews', [t, limit])
    const items = Array.isArray(result) ? result : result.items ?? []
    setCachedNews(t, items)
    return { items, providerName }
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
export function getMarketProfile(ticker, { forceRefresh = false } = {}) {
  const t = ticker.toUpperCase()

  if (!forceRefresh) {
    const cached = getCachedMarketProfile(t)
    if (cached) return Promise.resolve(cached)
  }

  return dedup(`profile:${t}`, async () => {
    const { result, providerName } = await callChain('getStockProfile', [t])
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
    await provider.getLatestPrice('AAPL', null, providerCfg)
    logCall({ callType: 'testProvider', args: [id], providerName: id, latencyMs: Date.now() - start, outcome: 'success', reason: null })
  } catch (err) {
    const safe = sanitiseReason(err.message)
    logCall({ callType: 'testProvider', args: [id], providerName: id, latencyMs: Date.now() - start, outcome: 'failure', reason: safe })
    throw new Error(safe ?? 'Connection failed')
  }
}
