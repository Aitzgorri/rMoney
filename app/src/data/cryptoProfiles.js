// SPEC-036 — crypto profile store: one symbol→CoinGecko-coin mapping per coin.
// Keyed by ticker (symbol, uppercased). Separate from stockProfiles because that
// store is keyed by ticker alone and a stock "BTC" must never collide with a
// crypto "BTC" (D6), and it carries stock-only fields. Holds the resolved coinId
// (SPEC-029 / D8) so pricing skips the symbol guess, plus the coin name for display.

import appStorage from '../utils/appStorage'

const KEY = 'rmoney_crypto_profiles'

function load() { try { return JSON.parse(appStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { appStorage.setItem(KEY, JSON.stringify(data)) }

export function getCryptoProfile(ticker) {
  const t = ticker?.trim().toUpperCase()
  return load().find(p => p.ticker === t) ?? null
}

export function getCryptoProfiles() { return load() }

// The resolved CoinGecko coin id for a symbol (e.g. 'BTC' → 'bitcoin'), or null.
export function getCoinId(ticker) {
  return getCryptoProfile(ticker)?.coinId ?? null
}

export function upsertCryptoProfile(ticker, fields) {
  const t = ticker?.trim().toUpperCase()
  const list = load()
  const existing = list.find(p => p.ticker === t)
  if (existing) {
    save(list.map(p => p.ticker === t ? { ...p, ...fields } : p))
  } else {
    save([...list, { ticker: t, coinId: null, name: null, ...fields }])
  }
}

// Records the user's chosen symbol→coin mapping from the entry coin picker (D8).
export function setCryptoCoin(ticker, { coinId, name = null }) {
  upsertCryptoProfile(ticker, { coinId, name, confirmedAt: new Date().toISOString() })
}

export function deleteCryptoProfile(ticker) {
  const t = ticker?.trim().toUpperCase()
  save(load().filter(p => p.ticker !== t))
}

// ─── Storage-tab helpers (SPEC-026) ───────────────────────────────────────────

export function getCryptoProfilesStorageBytes() {
  const raw = appStorage.getItem(KEY) ?? '[]'
  return new Blob([raw]).size
}

export function deleteAllCryptoProfiles() { save([]) }
