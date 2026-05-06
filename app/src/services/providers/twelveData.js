import { resolveExchange, PROVIDER_EXCHANGE, stripProviderSuffix } from '../../utils/marketDataExchanges'
import { normaliseMinorUnit } from '../../utils/marketDataNormalise'

const BASE = 'https://api.twelvedata.com'

async function td(path, params, config) {
  const url = new URL(path, BASE)
  Object.entries({ ...params, apikey: config.apiKey }).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  if (data.status === 'error' || data.code === 400) throw new Error(data.message ?? 'API error')
  return data
}

function tdSymbol(ticker, exchange) {
  const bare = stripProviderSuffix(ticker)
  if (!exchange) return bare
  const mic  = resolveExchange(exchange)
  const code = PROVIDER_EXCHANGE.twelveData(mic)
  return code ? `${bare}:${code}` : bare
}

function periodToOutputSize(period) {
  const map = { '1M': 30, '3M': 90, '6M': 183, '1Y': 365, '5Y': 1825 }
  return map[period] ?? 5000   // MAX
}

function resolutionToInterval(resolution) {
  switch (resolution) {
    case '1W': return '1week'
    case '1M': return '1month'
    default:   return '1day'
  }
}

export const twelveData = {
  async getLatestPrice(ticker, exchange, config) {
    const symbol = tdSymbol(ticker, exchange)
    const data = await td('/quote', { symbol }, config)
    if (!data.close) throw new Error('no data')
    const { price, currency } = normaliseMinorUnit(parseFloat(data.close), data.currency ?? null)
    return { price, currency, asOf: data.datetime ?? null }
  },

  async getHistoricalSeries(ticker, exchange, period, resolution, config) {
    const symbol = tdSymbol(ticker, exchange)
    const data = await td('/time_series', {
      symbol,
      interval:   resolutionToInterval(resolution),
      outputsize: periodToOutputSize(period),
      order:      'ASC',
    }, config)
    if (!data.values) throw new Error('no data')
    return data.values.map(v => ({ date: v.datetime.slice(0, 10), close: parseFloat(v.close) }))
  },

  async getDividends(ticker, _exchange, fromDate, toDate, config) {
    const data = await td('/dividends', { symbol: ticker, start_date: fromDate, end_date: toDate }, config)
    if (!data.dividends) throw new Error('no data')
    return data.dividends.map(d => {
      const { price: amount, currency } = normaliseMinorUnit(parseFloat(d.amount), d.currency ?? null)
      return {
        exDate:      d.ex_dividend_date,
        amount,
        currency,
        paymentDate: d.payment_date ?? null,
      }
    })
  },

  async getCorporateActions(ticker, fromDate, config) {
    const data = await td('/splits', { symbol: ticker, range: 'full' }, config)
    if (!data.splits) throw new Error('no data')
    return data.splits
      .filter(s => s.date >= fromDate)
      .map(s => ({
        date:  s.date,
        type:  'split',
        ratio: { numerator: Number(s.to_factor), denominator: Number(s.from_factor) },
      }))
  },

  async getNews(_ticker, _limit, _config) {
    // Twelve Data does not expose a news endpoint on standard plans
    throw new Error('not supported')
  },

  async getForex(fromCurrency, toCurrency, config) {
    const symbol = `${fromCurrency}/${toCurrency}`
    const data = await td('/quote', { symbol }, config)
    if (!data.close) throw new Error('no data')
    return {
      rate: parseFloat(data.close),
      asOf: data.datetime ?? null,
    }
  },

  async getHistoricalForex(fromCurrency, toCurrency, date, config) {
    const symbol = `${fromCurrency}/${toCurrency}`
    const data = await td('/time_series', {
      symbol,
      interval:   '1day',
      outputsize: 1,
      end_date:   date,
      order:      'DESC',
    }, config)
    if (!data.values?.length) throw new Error('no data')
    return {
      rate: parseFloat(data.values[0].close),
      date: data.values[0].datetime.slice(0, 10),
    }
  },

  async getIntradaySeries(ticker, exchange, config) {
    const symbol = tdSymbol(ticker, exchange)
    const data = await td('/time_series', {
      symbol,
      interval:   '1min',
      outputsize: 500,
      order:      'ASC',
    }, config)
    if (!data.values) throw new Error('no data')
    return data.values.map(v => ({
      time:  v.datetime.replace(' ', 'T'),
      close: parseFloat(v.close),
    }))
  },

  async getIndexSeries(indexTicker, period, resolution, config) {
    return twelveData.getHistoricalSeries(indexTicker, null, period, resolution, config)
  },

  async searchSymbols(query, config) {
    const data = await td('/symbol_search', { symbol: query, show_plan: false }, config)
    const items = data.data ?? []
    return items
      .filter(d => d.instrument_type === 'Common Stock' || d.instrument_type === 'ETF')
      .flatMap(d => {
        const bare = stripProviderSuffix(d.symbol ?? '')
        if (!bare) return []
        const mic = resolveExchange(d.mic_code || d.exchange || '')
        if (!mic) return []
        const { currency } = normaliseMinorUnit(0, d.currency ?? null)
        return [{ ticker: bare, name: d.instrument_name ?? null, exchange: mic, currency, source: 'Twelve Data' }]
      })
  },

  async getStockProfile(ticker, config) {
    const data = await td('/profile', { symbol: ticker }, config)
    if (!data.name) throw new Error('no data')
    return {
      name:      data.name,
      exchanges: data.exchange ? [data.exchange] : [],
      hqCountry: data.country ?? null,
      currency:  data.currency ?? null,
    }
  },
}
