const BASE = 'https://www.alphavantage.co/query'

async function av(params, config) {
  const url = new URL(BASE)
  Object.entries({ ...params, apikey: config.apiKey }).forEach(([k, v]) => url.searchParams.set(k, v))
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  // AV returns { "Information": "..." } when rate-limited or key invalid
  if (data.Information || data.Note) throw new Error(data.Information ?? data.Note)
  return data
}

function periodToOutputSize(period) {
  if (period === '1M' || period === '3M') return 'compact'   // 100 data points
  return 'full'
}

function resolutionParam(resolution) {
  switch (resolution) {
    case '1W': return { function: 'TIME_SERIES_WEEKLY',  key: 'Weekly Time Series' }
    case '1M': return { function: 'TIME_SERIES_MONTHLY', key: 'Monthly Time Series' }
    default:   return { function: 'TIME_SERIES_DAILY',   key: 'Time Series (Daily)' }
  }
}

function periodCutoff(period) {
  const days = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '5Y': 1825 }[period]
  if (!days) return null  // MAX — no cutoff
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}

export const alphaVantage = {
  async getLatestPrice(ticker, exchange, config) {
    const data = await av({ function: 'GLOBAL_QUOTE', symbol: ticker }, config)
    const q = data['Global Quote']
    if (!q?.['05. price']) throw new Error('no data')
    return {
      price:    parseFloat(q['05. price']),
      currency: null,   // GLOBAL_QUOTE does not return currency
      asOf:     q['07. latest trading day'],
    }
  },

  async getHistoricalSeries(ticker, exchange, period, resolution, config) {
    const { function: fn, key } = resolutionParam(resolution)
    const params = { function: fn, symbol: ticker }
    if (resolution === '1D') params.outputsize = periodToOutputSize(period)
    const data = await av(params, config)
    const series = data[key]
    if (!series) throw new Error('no data')
    const cutoff = periodCutoff(period)
    return Object.entries(series)
      .filter(([date]) => !cutoff || date >= cutoff)
      .map(([date, v]) => ({ date, close: parseFloat(v['4. close']) }))
      .sort((a, b) => a.date.localeCompare(b.date))
  },

  async getDividends(ticker, _exchange, fromDate, toDate, config) {
    // TIME_SERIES_DAILY_ADJUSTED has a "7. dividend amount" field on ex-dividend days
    const data = await av({ function: 'TIME_SERIES_DAILY_ADJUSTED', symbol: ticker, outputsize: 'full' }, config)
    const series = data['Time Series (Daily)']
    if (!series) throw new Error('no data')
    return Object.entries(series)
      .filter(([date]) => date >= fromDate && date <= toDate)
      .filter(([, v]) => parseFloat(v['7. dividend amount']) > 0)
      .map(([date, v]) => ({
        exDate:   date,
        amount:   parseFloat(v['7. dividend amount']),
        currency: null,   // not returned in adjusted series
      }))
      .sort((a, b) => a.exDate.localeCompare(b.exDate))
  },

  async getCorporateActions(ticker, fromDate, config) {
    const data = await av({ function: 'TIME_SERIES_DAILY_ADJUSTED', symbol: ticker, outputsize: 'full' }, config)
    const series = data['Time Series (Daily)']
    if (!series) throw new Error('no data')
    return Object.entries(series)
      .filter(([date]) => date >= fromDate)
      .filter(([, v]) => parseFloat(v['8. split coefficient']) !== 1)
      .map(([date, v]) => {
        const coeff = parseFloat(v['8. split coefficient'])
        // AV split coefficient = new shares / old shares (e.g. 4.0 for a 4:1 split)
        return { date, type: 'split', ratio: { numerator: coeff, denominator: 1 } }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  },

  async getNews(ticker, limit = 5, config) {
    const data = await av({ function: 'NEWS_SENTIMENT', tickers: ticker, limit: String(limit) }, config)
    if (!data.feed) throw new Error('no data')
    return data.feed.slice(0, limit).map(item => ({
      headline:    item.title,
      source:      item.source,
      url:         item.url,
      publishedAt: item.time_published,
    }))
  },

  async getForex(fromCurrency, toCurrency, config) {
    const data = await av({ function: 'CURRENCY_EXCHANGE_RATE', from_currency: fromCurrency, to_currency: toCurrency }, config)
    const r = data['Realtime Currency Exchange Rate']
    if (!r?.['5. Exchange Rate']) throw new Error('no data')
    return {
      rate: parseFloat(r['5. Exchange Rate']),
      asOf: r['6. Last Refreshed'],
    }
  },

  async getHistoricalForex(fromCurrency, toCurrency, date, config) {
    const data = await av({ function: 'FX_DAILY', from_symbol: fromCurrency, to_symbol: toCurrency, outputsize: 'full' }, config)
    const series = data['Time Series FX (Daily)']
    if (!series) throw new Error('no data')
    // Find the closest available date on or before the requested date
    const closest = Object.keys(series).sort().reverse().find(d => d <= date)
    if (!closest) throw new Error('no data for date ' + date)
    return {
      rate: parseFloat(series[closest]['4. close']),
      date: closest,
    }
  },

  async getIndexSeries(indexTicker, period, resolution, config) {
    return alphaVantage.getHistoricalSeries(indexTicker, null, period, resolution, config)
  },

  async getIntradaySeries(_ticker, _exchange, _config) {
    throw new Error('not supported')
  },

  async searchSymbols(_query, _config) {
    // AV SYMBOL_SEARCH returns region names and non-standard ticker suffixes (.LON, .DEX, etc.)
    // that can't be mapped to canonical MICs without a bespoke lookup table — deferred.
    throw new Error('not supported')
  },

  async getStockProfile(ticker, _exchange, config) {
    const data = await av({ function: 'OVERVIEW', symbol: ticker }, config)
    if (!data.Symbol) throw new Error('no data')
    return {
      name:      data.Name,
      exchanges: data.Exchange ? [data.Exchange] : [],
      hqCountry: data.Country,
      currency:  data.Currency,
    }
  },
}
