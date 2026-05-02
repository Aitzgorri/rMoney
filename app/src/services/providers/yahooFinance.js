// Yahoo Finance — free, no API key required.
// CORS: Yahoo does NOT send Access-Control-Allow-Origin, so every call goes
// through marketDataFetch with requiresProxy: true (Tauri HTTP plugin in
// production, Vite /__yfproxy in dev).
//
// Ticker convention: non-US exchanges append a suffix (BYG.L for LSE,
// ASML.AS for AMS, BMW.DE for Frankfurt, etc.).  resolveExchange() maps any
// user-supplied exchange name to a canonical MIC, then PROVIDER_EXCHANGE.yahoo
// maps that MIC to the Yahoo suffix.

import { marketDataFetch } from '../../utils/marketDataFetch'
import { resolveExchange, PROVIDER_EXCHANGE, stripProviderSuffix } from '../../utils/marketDataExchanges'
import { normaliseMinorUnit } from '../../utils/marketDataNormalise'

const BASE = 'https://query1.finance.yahoo.com'
const PROXY = { requiresProxy: true }

function yfTicker(ticker, exchange) {
  const bare = stripProviderSuffix(ticker)
  if (!exchange) return bare
  const mic = resolveExchange(exchange)
  const suffix = PROVIDER_EXCHANGE.yahoo(mic)
  return suffix ? `${bare}.${suffix}` : bare
}

async function yf(path, params = {}) {
  const url = new URL(path, BASE)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  const r = await marketDataFetch(url.toString(), {}, PROXY)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  const err = data?.chart?.error ?? data?.quoteSummary?.error
  if (err) throw new Error(err.description ?? 'Yahoo Finance error')
  return data
}

function unixToDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function periodToRange(period) {
  return { '1M': '1mo', '3M': '3mo', '6M': '6mo', '1Y': '1y', '5Y': '5y', MAX: 'max' }[period] ?? '1y'
}

function resolutionToInterval(resolution) {
  return { '1W': '1wk', '1M': '1mo' }[resolution] ?? '1d'
}

export const yahooFinance = {
  async getLatestPrice(ticker, exchange, _config) {
    const sym = yfTicker(ticker, exchange)
    const data = await yf(`/v8/finance/chart/${sym}`, { interval: '1d', range: '1d' })
    const meta = data.chart.result?.[0]?.meta
    if (!meta?.regularMarketPrice) throw new Error('no data')
    const { price, currency } = normaliseMinorUnit(meta.regularMarketPrice, meta.currency ?? null)
    return {
      price,
      currency,
      asOf: meta.regularMarketTime ? unixToDate(meta.regularMarketTime) : null,
    }
  },

  async getHistoricalSeries(ticker, exchange, period, resolution, _config) {
    const sym = yfTicker(ticker, exchange)
    const data = await yf(`/v8/finance/chart/${sym}`, {
      interval: resolutionToInterval(resolution),
      range:    periodToRange(period),
    })
    const result = data.chart.result?.[0]
    if (!result) throw new Error('no data')
    const timestamps = result.timestamp ?? []
    const closes     = result.indicators?.quote?.[0]?.close ?? []
    return timestamps
      .map((ts, i) => ({ date: unixToDate(ts), close: closes[i] }))
      .filter(({ close }) => close != null)
  },

  async getDividends(ticker, fromDate, toDate, _config) {
    const sym = yfTicker(ticker, null)
    const data = await yf(`/v8/finance/chart/${sym}`, {
      interval: '1d',
      range:    'max',
      events:   'div',
    })
    const divMap = data.chart.result?.[0]?.events?.dividends ?? {}
    return Object.values(divMap)
      .map(d => ({
        exDate:   unixToDate(d.date),
        amount:   d.amount,
        currency: data.chart.result[0].meta?.currency ?? null,
      }))
      .filter(d => d.exDate >= fromDate && d.exDate <= toDate)
      .sort((a, b) => a.exDate.localeCompare(b.exDate))
  },

  async getCorporateActions(ticker, fromDate, _config) {
    const sym = yfTicker(ticker, null)
    const data = await yf(`/v8/finance/chart/${sym}`, {
      interval: '1d',
      range:    'max',
      events:   'splits',
    })
    const splitMap = data.chart.result?.[0]?.events?.splits ?? {}
    return Object.values(splitMap)
      .map(s => ({
        date: unixToDate(s.date),
        type: 'split',
        ratio: { numerator: s.numerator, denominator: s.denominator },
      }))
      .filter(s => s.date >= fromDate)
      .sort((a, b) => a.date.localeCompare(b.date))
  },

  async getNews(_ticker, _limit, _config) {
    // Yahoo Finance v8 chart endpoint does not provide news
    throw new Error('not supported')
  },

  async getForex(fromCurrency, toCurrency, _config) {
    const sym = `${fromCurrency}${toCurrency}=X`
    const data = await yf(`/v8/finance/chart/${sym}`, { interval: '1d', range: '1d' })
    const meta = data.chart.result?.[0]?.meta
    if (!meta?.regularMarketPrice) throw new Error('no data')
    return {
      rate: meta.regularMarketPrice,
      asOf: meta.regularMarketTime ? unixToDate(meta.regularMarketTime) : null,
    }
  },

  async getHistoricalForex(fromCurrency, toCurrency, date, _config) {
    const sym = `${fromCurrency}${toCurrency}=X`
    const data = await yf(`/v8/finance/chart/${sym}`, { interval: '1d', range: '5y' })
    const result = data.chart.result?.[0]
    if (!result) throw new Error('no data')
    const timestamps = result.timestamp ?? []
    const closes     = result.indicators?.quote?.[0]?.close ?? []
    const entries = timestamps
      .map((ts, i) => ({ date: unixToDate(ts), rate: closes[i] }))
      .filter(e => e.rate != null && e.date <= date)
    if (!entries.length) throw new Error('no data for date ' + date)
    const closest = entries[entries.length - 1]
    return { rate: closest.rate, date: closest.date }
  },

  async getIndexSeries(indexTicker, period, resolution, _config) {
    return yahooFinance.getHistoricalSeries(indexTicker, null, period, resolution, _config)
  },

  async searchSymbols(query, _config) {
    const data = await yf('/v1/finance/search', { q: query, quotesCount: 20, newsCount: 0 })
    const quotes = data.quotes ?? []
    return quotes
      .filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      .flatMap(q => {
        const bare = stripProviderSuffix(q.symbol ?? '')
        if (!bare) return []
        const mic = resolveExchange(q.exchange ?? '')
        if (!mic) return []
        const { currency } = normaliseMinorUnit(0, q.currency ?? null)
        return [{ ticker: bare, name: q.longname ?? q.shortname ?? null, exchange: mic, currency, source: 'Yahoo' }]
      })
  },

  async getStockProfile(ticker, _config) {
    // Yahoo Finance quoteSummary uses a different base path but same proxy
    const url = new URL(`/v10/finance/quoteSummary/${ticker}`, BASE)
    url.searchParams.set('modules', 'assetProfile,price')
    const r = await marketDataFetch(url.toString(), {}, PROXY)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await r.json()
    const err = data?.quoteSummary?.error
    if (err) throw new Error(err.description ?? 'Yahoo Finance error')
    const price   = data.quoteSummary?.result?.[0]?.price
    const profile = data.quoteSummary?.result?.[0]?.assetProfile
    if (!price?.shortName && !price?.longName) throw new Error('no data')
    return {
      name:      price.longName ?? price.shortName ?? null,
      exchanges: price.exchangeName ? [price.exchangeName] : [],
      hqCountry: profile?.country ?? null,
      currency:  price.currency ?? null,
    }
  },
}
