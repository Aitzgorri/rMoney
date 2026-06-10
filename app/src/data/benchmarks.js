import { nanoid } from 'nanoid'
import appStorage from '../utils/appStorage'

const KEY = 'rmoney_benchmarks'

// Always present; not stored in appStorage
export const CURATED_BENCHMARKS = [
  { id: 'sp500',      ticker: '^GSPC',      exchange: null, displayName: 'S&P 500',       curated: true },
  { id: 'nasdaq100',  ticker: '^NDX',       exchange: null, displayName: 'NASDAQ 100',    curated: true },
  { id: 'msciworld',  ticker: 'URTH',       exchange: null, displayName: 'MSCI World',    curated: true },
  { id: 'ftse100',    ticker: '^FTSE',      exchange: null, displayName: 'FTSE 100',      curated: true },
  { id: 'eurostoxx',  ticker: '^STOXX50E',  exchange: null, displayName: 'Euro Stoxx 50', curated: true },
  { id: 'px',         ticker: '^PX',        exchange: null, displayName: 'PX',            curated: true },
]

function load() {
  try { return JSON.parse(appStorage.getItem(KEY)) ?? [] } catch { return [] }
}
function save(data) { appStorage.setItem(KEY, JSON.stringify(data)) }

// Returns curated first, then user-added
export function getBenchmarks() {
  return [...CURATED_BENCHMARKS, ...load()]
}

export function getUserBenchmarks() {
  return load()
}

export function createBenchmark(ticker, displayName) {
  const t = ticker.trim().toUpperCase()
  const item = {
    id: nanoid(),
    ticker: t,
    exchange: null,
    displayName: displayName.trim() || t,
    curated: false,
    createdAt: new Date().toISOString(),
  }
  save([...load(), item])
  return item
}

export function updateBenchmark(id, { displayName }) {
  save(load().map(b => b.id === id ? { ...b, displayName: displayName.trim() } : b))
}

export function deleteBenchmark(id) {
  save(load().filter(b => b.id !== id))
}

export function deleteAllUserBenchmarks() {
  save([])
}

export function getBenchmarksStorageBytes() {
  const raw = appStorage.getItem(KEY)
  return raw ? new Blob([raw]).size : 0
}
