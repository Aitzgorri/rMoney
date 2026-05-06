// Massive (massive.com) — rebranded Polygon.io.
// Same REST API paths as Polygon; auth via ?apiKey= query parameter.
// CORS: Polygon sends Access-Control-Allow-Origin: * — no proxy needed.
// Free tier covers US markets; international coverage requires a paid plan.

import { resolveExchange, PROVIDER_EXCHANGE, stripProviderSuffix } from '../../utils/marketDataExchanges'
import { normaliseMinorUnit } from '../../utils/marketDataNormalise'

const BASE = 'https://api.polygon.io'

async function pg(path, params, config) {
  const url = new URL(path, BASE)
  Object.entries({ ...params, apiKey: config.apiKey }).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  // Strip apiKey from error messages at the boundary — never let it surface up
  let r
  try {
    r = await fetch(url)
  } catch (err) {
    throw new Error('network error')
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  if (data.status === 'ERROR') throw new Error(data.error ?? 'API error')
  return data
}

function polyTicker(ticker, exchange) {
  const bare = stripProviderSuffix(ticker)
  if (!exchange) return bare
  const mic = resolveExchange(exchange)
  const code = PROVIDER_EXCHANGE.polygon(mic)
  return code && code !== mic ? `${code}:${bare}` : bare
}

function isoToYmd(iso) {
  return iso?.slice(0, 10) ?? null
}

export const massive = {
  async getLatestPrice(ticker, exchange, config) {
    const sym = polyTicker(ticker, exchange)
    const data = await pg(`/v2/aggs/ticker/${sym}/prev`, { adjusted: 'true' }, config)
    const bar = data.results?.[0]
    if (!bar) throw new Error('no data')
    // Polygon does not return currency in this endpoint; assume exchange-native
    return {
      price:    bar.c,
      currency: null,
      asOf:     isoToYmd(new Date(bar.t).toISOString()),
    }
  },

  async getHistoricalSeries(ticker, exchange, period, resolution, config) {
    const sym = polyTicker(ticker, exchange)
    const days   = { '1M': 30, '3M': 90, '6M': 183, '1Y': 365, '5Y': 1825 }[period] ?? 1825
    const toDate = new Date().toISOString().slice(0, 10)
    const fromDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const timespan = { '1W': 'week', '1M': 'month' }[resolution] ?? 'day'
    const data = await pg(
      `/v2/aggs/ticker/${sym}/range/1/${timespan}/${fromDate}/${toDate}`,
      { adjusted: 'true', sort: 'asc', limit: 5000 },
      config,
    )
    if (!data.results?.length) throw new Error('no data')
    return data.results.map(bar => ({
      date:  isoToYmd(new Date(bar.t).toISOString()),
      close: bar.c,
    }))
  },

  async getDividends(ticker, _exchange, fromDate, toDate, config) {
    const data = await pg('/v3/reference/dividends', {
      ticker,
      ex_dividend_date_gte: fromDate,
      ex_dividend_date_lte: toDate,
      limit: 1000,
      order: 'asc',
    }, config)
    if (!data.results) throw new Error('no data')
    const FREQ_MAP = { 1: 'annual', 2: 'semi-annual', 4: 'quarterly', 12: 'monthly' }
    return data.results.map(d => ({
      exDate:      d.ex_dividend_date,
      amount:      d.cash_amount,
      currency:    d.currency ?? null,
      paymentDate: d.pay_date ?? null,
      type:        d.dividend_type === 'CD' ? 'regular' : d.dividend_type === 'SC' ? 'special' : null,
      frequency:   FREQ_MAP[d.frequency] ?? null,
    }))
  },

  async getCorporateActions(ticker, fromDate, config) {
    const data = await pg('/v3/reference/splits', {
      ticker,
      execution_date_gte: fromDate,
      limit: 1000,
      order: 'asc',
    }, config)
    if (!data.results) throw new Error('no data')
    return data.results.map(s => ({
      date:  s.execution_date,
      type:  'split',
      ratio: { numerator: s.split_to, denominator: s.split_from },
    }))
  },

  async getNews(ticker, limit = 5, config) {
    const data = await pg('/v2/reference/news', { ticker, limit }, config)
    if (!data.results) throw new Error('no data')
    return data.results.slice(0, limit).map(item => ({
      headline:    item.title,
      source:      item.publisher?.name ?? null,
      url:         item.article_url,
      publishedAt: item.published_utc,
    }))
  },

  async getForex(fromCurrency, toCurrency, config) {
    const sym = `C:${fromCurrency}${toCurrency}`
    const data = await pg(`/v2/aggs/ticker/${sym}/prev`, { adjusted: 'true' }, config)
    const bar = data.results?.[0]
    if (!bar) throw new Error('no data')
    return {
      rate: bar.c,
      asOf: isoToYmd(new Date(bar.t).toISOString()),
    }
  },

  async getHistoricalForex(fromCurrency, toCurrency, date, config) {
    const sym  = `C:${fromCurrency}${toCurrency}`
    const data = await pg(
      `/v2/aggs/ticker/${sym}/range/1/day/${date}/${date}`,
      { adjusted: 'true', limit: 1 },
      config,
    )
    const bar = data.results?.[0]
    if (!bar) throw new Error('no data for date ' + date)
    return {
      rate: bar.c,
      date: isoToYmd(new Date(bar.t).toISOString()),
    }
  },

  async getIndexSeries(indexTicker, period, resolution, config) {
    return massive.getHistoricalSeries(indexTicker, null, period, resolution, config)
  },

  async searchSymbols(query, config) {
    const data = await pg('/v3/reference/tickers', { search: query, active: 'true', market: 'stocks', limit: 20 }, config)
    const results = data.results ?? []
    return results
      .filter(r => r.type === 'CS' || r.type === 'ETF')
      .flatMap(r => {
        const bare = stripProviderSuffix(r.ticker ?? '')
        if (!bare) return []
        const mic = resolveExchange(r.primary_exchange ?? '')
        if (!mic) return []
        const { currency } = normaliseMinorUnit(0, r.currency_name?.toUpperCase() ?? null)
        return [{ ticker: bare, name: r.name ?? null, exchange: mic, currency, source: 'Massive' }]
      })
  },

  async getIntradaySeries(_ticker, _exchange, _config) {
    throw new Error('not supported')
  },

  async getStockProfile(ticker, config) {
    const data = await pg(`/v3/reference/tickers/${ticker}`, {}, config)
    const r = data.results
    if (!r?.name) throw new Error('no data')
    return {
      name:      r.name,
      exchanges: r.primary_exchange ? [r.primary_exchange] : [],
      hqCountry: r.locale ?? null,
      currency:  r.currency_name?.toUpperCase() ?? null,
    }
  },
}
