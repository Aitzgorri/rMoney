// Finnhub (finnhub.io) — free tier, 60 calls/min, API key required.
// CORS: Access-Control-Allow-Origin: * — no proxy needed.
// Auth: ?token= query param on every request.

import { resolveExchange, PROVIDER_EXCHANGE, stripProviderSuffix, CANONICAL_EXCHANGES } from '../../utils/marketDataExchanges'
import { normaliseMinorUnit } from '../../utils/marketDataNormalise'

const BASE = 'https://finnhub.io/api/v1'

async function fh(path, params, config) {
  if (!config?.apiKey) throw new Error('no api key configured')
  // String-concat (not `new URL(path, BASE)`) so absolute paths don't replace BASE's /api/v1 prefix.
  const url = new URL(`${BASE}${path}`)
  Object.entries({ ...params, token: config.apiKey }).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function finnhubSymbol(ticker, exchange) {
  const bare   = stripProviderSuffix(ticker)
  if (!exchange) return bare
  const mic    = resolveExchange(exchange)
  const suffix = PROVIDER_EXCHANGE.finnhub(mic)
  return suffix ? `${bare}.${suffix}` : bare
}

// Finnhub's quote and candle endpoints return prices in the exchange's quoted
// currency, which may be a minor unit (LSE quotes in pence, GBp).
const QUOTED_CURRENCY = { XLON: 'GBp' }

function inferQuotedCurrency(exchange) {
  const mic = exchange ? resolveExchange(exchange) : null
  if (!mic) return null
  return QUOTED_CURRENCY[mic] ?? CANONICAL_EXCHANGES.find(e => e.mic === mic)?.currency ?? null
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

const PERIOD_DAYS = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '5Y': 1831 }

function periodToUnixFrom(period) {
  const days = PERIOD_DAYS[period] ?? 365
  return Math.floor(Date.now() / 1000) - days * 86400
}

function resolutionToCandle(resolution) {
  if (resolution === '1W') return 'W'
  if (resolution === '1M') return 'M'
  return 'D'
}

// Reverse of PROVIDER_EXCHANGE.finnhub — recovers MIC from displaySymbol suffix in search results.
const SUFFIX_TO_MIC = {
  L:  'XLON', F:  'XFRA', DE: 'XETR', AS: 'XAMS', PA: 'XPAR',
  SW: 'XSWX', MC: 'XMAD', MI: 'XMIL', ST: 'XSTO', HE: 'XHEL',
  OL: 'XOSL', CO: 'XCSE', AX: 'XASX', T:  'XTKS', TO: 'XTSE',
  HK: 'XHKG',
}

const MIC_TO_CURRENCY = Object.fromEntries(CANONICAL_EXCHANGES.map(e => [e.mic, e.currency]))

export const finnhub = {
  async getLatestPrice(ticker, exchange, config) {
    const symbol = finnhubSymbol(ticker, exchange)
    const data   = await fh('/quote', { symbol }, config)
    if (!data.c) throw new Error('no data')  // c=0 means no trading data / unrecognised symbol
    const raw = inferQuotedCurrency(exchange)
    const { price, currency } = normaliseMinorUnit(data.c, raw)
    return {
      price,
      currency,
      asOf: data.t ? new Date(data.t * 1000).toISOString() : null,
    }
  },

  async getHistoricalSeries(ticker, exchange, period, resolution, config) {
    const symbol = finnhubSymbol(ticker, exchange)
    const to     = Math.floor(Date.now() / 1000)
    const from   = periodToUnixFrom(period)
    const data   = await fh('/stock/candle', {
      symbol,
      resolution: resolutionToCandle(resolution),
      from,
      to,
    }, config)
    if (data.s === 'no_data' || !data.c?.length) throw new Error('no data')
    const raw = inferQuotedCurrency(exchange)
    return data.c.map((close, i) => ({
      date:  new Date(data.t[i] * 1000).toISOString().slice(0, 10),
      close: normaliseMinorUnit(close, raw).price,
    }))
  },

  async getIntradaySeries(ticker, exchange, config) {
    const symbol = finnhubSymbol(ticker, exchange)
    const to     = Math.floor(Date.now() / 1000)
    const from   = to - 86400
    const data   = await fh('/stock/candle', { symbol, resolution: '1', from, to }, config)
    if (data.s === 'no_data' || !data.c?.length) throw new Error('no data')
    const raw = inferQuotedCurrency(exchange)
    return data.c.map((close, i) => ({
      time:  new Date(data.t[i] * 1000).toISOString(),
      close: normaliseMinorUnit(close, raw).price,
    }))
  },

  async getDividends(ticker, _exchange, fromDate, toDate, config) {
    const data = await fh('/stock/dividend', {
      symbol: stripProviderSuffix(ticker),
      from:   fromDate,
      to:     toDate ?? todayIso(),
    }, config)
    if (!Array.isArray(data)) throw new Error('no data')
    return data.map(d => {
      const { price: amount, currency } = normaliseMinorUnit(parseFloat(d.amount), d.currency ?? null)
      return {
        exDate:      d.exDate,
        amount,
        currency,
        paymentDate: d.payDate ?? null,
      }
    })
  },

  async getCorporateActions(ticker, fromDate, config) {
    const data = await fh('/stock/split', {
      symbol: stripProviderSuffix(ticker),
      from:   fromDate,
      to:     todayIso(),
    }, config)
    if (!data?.data) throw new Error('no data')
    return data.data.map(s => ({
      date:  s.date,
      type:  'split',
      ratio: { numerator: Number(s.toFactor), denominator: Number(s.fromFactor) },
    }))
  },

  async getNews(ticker, limit = 5, config) {
    const to   = todayIso()
    const from = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10)
    const data = await fh('/company-news', {
      symbol: stripProviderSuffix(ticker),
      from,
      to,
    }, config)
    if (!Array.isArray(data)) throw new Error('no data')
    return data.slice(0, limit).map(n => ({
      headline:    n.headline,
      source:      n.source,
      url:         n.url,
      publishedAt: n.datetime ? new Date(n.datetime * 1000).toISOString() : null,
    }))
  },

  async getForex(fromCurrency, toCurrency, config) {
    const data = await fh('/forex/rates', { base: fromCurrency }, config)
    const rate = data.quote?.[toCurrency]
    if (!rate) throw new Error('no data')
    return { rate, asOf: new Date().toISOString() }
  },

  async getHistoricalForex(_from, _to, _date, _config) {
    // Historical forex candles are premium-only on Finnhub — fall through to next provider.
    throw new Error('not supported')
  },

  async getIndexSeries(indexTicker, period, resolution, config) {
    return finnhub.getHistoricalSeries(indexTicker, null, period, resolution, config)
  },

  async getStockProfile(ticker, exchange, config) {
    const symbol = finnhubSymbol(ticker, exchange)
    const data   = await fh('/stock/profile2', { symbol }, config)
    if (!data.name) throw new Error('no data')
    const mic = resolveExchange(data.exchange ?? '')
    const { currency } = normaliseMinorUnit(0, data.currency ?? null)
    return {
      name:      data.name,
      exchanges: mic ? [mic] : (data.exchange ? [data.exchange] : []),
      hqCountry: data.country ?? null,
      currency,
    }
  },

  // Finnhub search returns symbols with a dot-suffix that encodes the exchange
  // (e.g. "SGRO.L" → XLON). Suffix-less symbols are US-listed but without a
  // distinguishable exchange (NYSE vs NASDAQ), so we drop them — Yahoo Finance
  // and Massive cover US search better and are earlier in the chain.
  async searchSymbols(query, config) {
    const data  = await fh('/search', { q: query }, config)
    const items = data.result ?? []
    return items
      .filter(d => d.type === 'Common Stock' || d.type === 'ETP')
      .flatMap(d => {
        const symbol = d.displaySymbol ?? d.symbol ?? ''
        const bare   = stripProviderSuffix(symbol)
        if (!bare) return []
        const dotIdx = symbol.lastIndexOf('.')
        const suffix = dotIdx !== -1 ? symbol.slice(dotIdx + 1) : null
        const mic    = suffix ? SUFFIX_TO_MIC[suffix] : null
        if (!mic) return []
        const currency = MIC_TO_CURRENCY[mic] ?? null
        return [{ ticker: bare, name: d.description ?? null, exchange: mic, currency, source: 'Finnhub' }]
      })
  },
}
