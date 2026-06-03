// CoinGecko (coingecko.com) — free, key-less crypto price API (SPEC-036, D5).
// CORS: the public API sends Access-Control-Allow-Origin: * — no proxy needed.
// Crypto-only: spot + historical prices for coins, priced in a fiat `vsCurrency`
// (default USD) supplied via config. The `exchange` argument is unused — crypto
// has no listing exchange (D1: a wallet label fills that slot).
//
// Symbol→coin-id: CoinGecko keys historical data on a coin id ("bitcoin"), not a
// symbol ("BTC"), and symbols collide across coins. Here we pick the highest
// market-cap coin for a symbol as a sensible default; the user-facing
// disambiguation/storage flow is SPEC-029 resolution (build-order step 7).
//
// No API key → no secret, no logging of URLs/keys (SPEC-031): callers log only
// the ticker, and this module never logs.

const BASE = 'https://api.coingecko.com/api/v3'

// Session cache: `${SYMBOL}:${vs}` → coin id. Avoids a repeat markets lookup
// before each historical call.
const _idCache = new Map()

async function cg(path, params) {
  const url = new URL(`${BASE}${path}`)
  Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const PERIOD_DAYS = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '5Y': 1826 }

// Resolve a crypto symbol (e.g. "BTC") to its CoinGecko market row in `vs` fiat,
// choosing the highest-market-cap coin that carries that symbol (the canonical one).
async function resolveMarket(symbol, vs) {
  const data = await cg('/coins/markets', {
    vs_currency: vs,
    symbols: symbol.trim().toLowerCase(),
    order: 'market_cap_desc',
    per_page: 50,
    page: 1,
  })
  if (!Array.isArray(data) || data.length === 0) throw new Error('no data')
  return data.reduce((best, row) => ((row.market_cap ?? 0) > (best.market_cap ?? 0) ? row : best))
}

const notSupported = () => async () => { throw new Error('not supported') }

export const coingecko = {
  // config.vsCurrency: fiat to price in (default 'usd'). config.coinId: a resolved CoinGecko
  // coin id (SPEC-029, step 7) — when present it is used directly and the symbol guess is skipped.
  // Returns { price, currency, asOf }.
  async getLatestPrice(ticker, _exchange, config) {
    const vs = (config?.vsCurrency ?? 'usd').toLowerCase()
    if (config?.coinId) {
      const data = await cg('/simple/price', { ids: config.coinId, vs_currencies: vs, include_last_updated_at: true })
      const row = data?.[config.coinId]
      if (!row || row[vs] == null) throw new Error('no data')
      return {
        price: row[vs],
        currency: vs.toUpperCase(),
        asOf: row.last_updated_at ? new Date(row.last_updated_at * 1000).toISOString() : new Date().toISOString(),
      }
    }
    const m = await resolveMarket(ticker, vs)
    if (m.current_price == null) throw new Error('no data')
    _idCache.set(`${ticker.toUpperCase()}:${vs}`, m.id)
    return {
      price: m.current_price,
      currency: vs.toUpperCase(),
      asOf: m.last_updated ?? new Date().toISOString(),
    }
  },

  // Daily closes over the requested period, priced in config.vsCurrency. Uses config.coinId when
  // supplied (else resolves the symbol). Returns [{ date, close }].
  async getHistoricalSeries(ticker, _exchange, period, _resolution, config) {
    const vs = (config?.vsCurrency ?? 'usd').toLowerCase()
    let id = config?.coinId ?? _idCache.get(`${ticker.toUpperCase()}:${vs}`)
    if (!id) {
      id = (await resolveMarket(ticker, vs)).id
      _idCache.set(`${ticker.toUpperCase()}:${vs}`, id)
    }
    const days = PERIOD_DAYS[period] ?? 365
    const data = await cg(`/coins/${id}/market_chart`, { vs_currency: vs, days })
    const prices = data?.prices
    if (!Array.isArray(prices) || prices.length === 0) throw new Error('no data')
    // prices: [[msTimestamp, price], …]. Collapse to one close per day (last point wins).
    const byDay = new Map()
    for (const [ms, price] of prices) {
      byDay.set(new Date(ms).toISOString().slice(0, 10), price)
    }
    return [...byDay.entries()].map(([date, close]) => ({ date, close }))
  },

  // SPEC-036/SPEC-029 resolution: search coins by free text (symbol or name). Returns ranked
  // candidates [{ coinId, symbol, name, marketCapRank }] for the user to disambiguate
  // (e.g. "BTC" → bitcoin). Highest market-cap / lowest rank first.
  async searchCoins(query) {
    const data = await cg('/search', { query: query.trim() })
    const coins = data?.coins
    if (!Array.isArray(coins)) return []
    return coins.map(c => ({
      coinId: c.id,
      symbol: (c.symbol ?? '').toUpperCase(),
      name: c.name ?? null,
      marketCapRank: c.market_cap_rank ?? null,
    }))
  },

  // Everything else is out of scope for a crypto price source — throw so a chain falls through.
  getIntradaySeries:   notSupported(),
  getDividends:        notSupported(),
  getCorporateActions: notSupported(),
  getNews:             notSupported(),
  getForex:            notSupported(),
  getHistoricalForex:  notSupported(),
  getIndexSeries:      notSupported(),
  getStockProfile:     notSupported(),
  searchSymbols:       notSupported(),
}
