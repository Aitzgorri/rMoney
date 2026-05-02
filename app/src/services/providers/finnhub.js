// Finnhub (finnhub.io) — free tier, API key required.
// CORS: sends Access-Control-Allow-Origin: * — no proxy needed.
// Pass 2 implementation: all methods throw so the chain falls through.

const notImplemented = method => async () => { throw new Error(`Finnhub: ${method} not implemented`) }

export const finnhub = {
  getLatestPrice:      notImplemented('getLatestPrice'),
  getHistoricalSeries: notImplemented('getHistoricalSeries'),
  getDividends:        notImplemented('getDividends'),
  getCorporateActions: notImplemented('getCorporateActions'),
  getNews:             notImplemented('getNews'),
  getForex:            notImplemented('getForex'),
  getHistoricalForex:  notImplemented('getHistoricalForex'),
  getIndexSeries:      notImplemented('getIndexSeries'),
  getStockProfile:     notImplemented('getStockProfile'),
  // Search results lack exchange/currency — chain falls through to other providers
  searchSymbols:       notImplemented('searchSymbols'),
}
