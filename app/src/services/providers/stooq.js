// Stooq (stooq.com) — free, no API key required. Price data only.
// CORS: does NOT send Access-Control-Allow-Origin — requires proxy (marketDataFetch).
// Pass 2 implementation: all methods throw so the chain falls through.

const notImplemented = method => async () => { throw new Error(`Stooq: ${method} not implemented`) }

export const stooq = {
  getLatestPrice:      notImplemented('getLatestPrice'),
  getHistoricalSeries: notImplemented('getHistoricalSeries'),
  getDividends:        notImplemented('getDividends'),
  getCorporateActions: notImplemented('getCorporateActions'),
  getNews:             notImplemented('getNews'),
  getForex:            notImplemented('getForex'),
  getHistoricalForex:  notImplemented('getHistoricalForex'),
  getIndexSeries:      notImplemented('getIndexSeries'),
  getStockProfile:     notImplemented('getStockProfile'),
  searchSymbols:       notImplemented('searchSymbols'),
}
