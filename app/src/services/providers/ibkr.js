// IBKR Web API — DEFERRED
//
// As of 2026, IBKR's cloud-based OAuth 2.0 is available for institutional/advisor
// clients only. Individual retail accounts must use the Client Portal Gateway (a
// local binary), which we've explicitly ruled out. IBKR is tracking OAuth 2.0 for
// retail with no published ETA.
//
// The provider slot is kept in the chain so it falls through harmlessly to the next
// provider. When IBKR retail OAuth 2.0 ships, wire up the OAuth helpers and data
// adapter here. Their flow uses private_key_jwt (RFC 7521/7523) — the client signs
// a JWT with a registered private key rather than a client_id + secret.

// Stub used by the Settings UI — always returns 'disconnected' until implemented.
export function getIbkrOAuthStatus(_config) {
  return 'disconnected'
}

// Stub — throws so Settings "Connect" button has something to call.
export function buildIbkrAuthUrl(_clientId) {
  throw new Error('IBKR OAuth not yet available for retail accounts')
}

// ─── Data adapter ─────────────────────────────────────────────────────────────

const notImplemented = method => async () => { throw new Error(`IBKR: ${method} deferred`) }

export const ibkr = {
  getLatestPrice:      notImplemented('getLatestPrice'),
  getHistoricalSeries: notImplemented('getHistoricalSeries'),
  getIntradaySeries:   notImplemented('getIntradaySeries'),
  getDividends:        notImplemented('getDividends'),
  getCorporateActions: notImplemented('getCorporateActions'),
  getNews:             notImplemented('getNews'),
  getForex:            notImplemented('getForex'),
  getHistoricalForex:  notImplemented('getHistoricalForex'),
  getIndexSeries:      notImplemented('getIndexSeries'),
  getStockProfile:     notImplemented('getStockProfile'),
  searchSymbols:       notImplemented('searchSymbols'),
}
