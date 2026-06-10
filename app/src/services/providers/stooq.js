// Stooq (stooq.com) — free, key-less CSV endpoint. EOD price data only.
// CORS: no Access-Control-Allow-Origin — every call goes through marketDataFetch
// with requiresProxy: true (Tauri HTTP plugin in production, Vite /__stooq in dev).
//
// Upstream changes (2026): Stooq removed the light-quote endpoint (/q/l/, now a
// hard 404) and put the historical CSV endpoint (/q/d/l/) behind a JavaScript
// proof-of-work anti-bot gate. Consequences:
//   • getLatestPrice can no longer work — it throws and the chain falls through.
//   • getHistoricalSeries fetches via stooqFetch (see stooqAuth.js), which clears
//     the proof-of-work gate. The endpoint also enforces a tight per-IP daily
//     download quota, so the client caches results (marketDataClient) to avoid
//     re-hitting it for data already received.
//
// Symbol format: lowercase ticker + country/exchange suffix (sgro.uk, bmw.de, aapl.us).
// resolveExchange() → MIC → PROVIDER_EXCHANGE.stooq → suffix. Tickers with no
// exchange default to .us since Stooq covers US listings by that convention.

import { marketDataFetch } from '../../utils/marketDataFetch'
import { stooqFetch } from './stooqAuth'
import { resolveExchange, PROVIDER_EXCHANGE, stripProviderSuffix, CANONICAL_EXCHANGES } from '../../utils/marketDataExchanges'
import { normaliseMinorUnit } from '../../utils/marketDataNormalise'

const BASE = 'https://stooq.com'
const PROXY = { requiresProxy: true }

// Stooq quotes some exchanges in minor units (LSE in pence).
const QUOTED_CURRENCY = { XLON: 'GBp' }

function inferQuotedCurrency(exchange) {
  const mic = exchange ? resolveExchange(exchange) : null
  if (!mic) return null
  return QUOTED_CURRENCY[mic] ?? CANONICAL_EXCHANGES.find(e => e.mic === mic)?.currency ?? null
}

function stooqSymbol(ticker, exchange) {
  const bare = stripProviderSuffix(ticker).toLowerCase()
  if (!bare) return null
  if (!exchange) return `${bare}.us`
  const mic = resolveExchange(exchange)
  const suffix = mic ? PROVIDER_EXCHANGE.stooq(mic) : null
  return suffix ? `${bare}.${suffix}` : null
}

// Stooq CSV: tolerate CRLF, drop blank lines, trim cells.
function parseCsv(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const fields = line.split(',').map(f => f.trim())
    return Object.fromEntries(headers.map((h, i) => [h, fields[i]]))
  })
}

function toYyyymmdd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

const PERIOD_DAYS = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '5Y': 1831 }

function resolutionToInterval(resolution) {
  if (resolution === '1W') return 'w'
  if (resolution === '1M') return 'm'
  return 'd'
}

const notSupported = () => async () => { throw new Error('not supported') }

export const stooq = {
  // Upstream removed the light-quote endpoint — this now always 404s. Kept so the
  // chain has a defined method; it simply throws and the next provider is tried.
  async getLatestPrice(ticker, exchange, _config) {
    const sym = stooqSymbol(ticker, exchange)
    if (!sym) throw new Error('no data')
    // f=sd2t2ohlcv → Symbol,Date,Time,Open,High,Low,Close,Volume; h includes header.
    const url = `${BASE}/q/l/?s=${sym}&f=sd2t2ohlcv&h&e=csv`
    const r = await marketDataFetch(url, {}, PROXY)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const rows = parseCsv(await r.text())
    if (!rows.length) throw new Error('no data')
    const row = rows[0]
    // Stooq returns "N/D" for every field when the symbol is unknown.
    const close = parseFloat(row.Close)
    if (!Number.isFinite(close)) throw new Error('no data')
    const raw = inferQuotedCurrency(exchange)
    const { price, currency } = normaliseMinorUnit(close, raw)
    const asOf = row.Date && row.Time && row.Date !== 'N/D'
      ? `${row.Date}T${row.Time}Z`
      : (row.Date && row.Date !== 'N/D' ? row.Date : null)
    return { price, currency, asOf }
  },

  async getHistoricalSeries(ticker, exchange, period, resolution, _config) {
    const sym = stooqSymbol(ticker, exchange)
    if (!sym) throw new Error('no data')
    const days = PERIOD_DAYS[period] ?? 365
    const d2 = toYyyymmdd(new Date())
    const d1 = toYyyymmdd(new Date(Date.now() - days * 86400 * 1000))
    const interval = resolutionToInterval(resolution)
    const url = `${BASE}/q/d/l/?s=${sym}&i=${interval}&d1=${d1}&d2=${d2}`
    // stooqFetch clears the proof-of-work gate and returns the CSV text (or '' when
    // the gate can't be cleared / the daily quota is exhausted → parsed as no data).
    const rows = parseCsv(await stooqFetch(url))
    if (!rows.length) throw new Error('no data')
    const raw = inferQuotedCurrency(exchange)
    return rows
      .map(r => ({ date: r.Date, close: parseFloat(r.Close) }))
      .filter(r => r.date && Number.isFinite(r.close))
      .map(({ date, close }) => ({ date, close: normaliseMinorUnit(close, raw).price }))
  },

  // Stooq's CSV endpoint is EOD prices only — everything else throws so the
  // chain falls through. Forex, intraday, dividends, profile, news, splits,
  // index series, and search are out of scope per SPEC-027.
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
