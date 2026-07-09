import { nanoid } from 'nanoid'
import { recordDeletion } from './syncMeta'
import appStorage from '../utils/appStorage'

const KEYS = {
  watchlists:       'rmoney_watchlists',
  entries:          'rmoney_watchlist_entries',
  alerts:           'rmoney_watchlist_alerts',
}

function load(key) { try { return JSON.parse(appStorage.getItem(key)) ?? [] } catch { return [] } }
function save(key, data) { appStorage.setItem(key, JSON.stringify(data)) }

// ─── Watchlists ───────────────────────────────────────────────────────────────

export function getWatchlists() {
  return load(KEYS.watchlists).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function createWatchlist(name) {
  const lists = load(KEYS.watchlists)
  const maxOrder = lists.reduce((m, l) => Math.max(m, l.order ?? 0), 0)
  const list = { id: nanoid(), name: name.trim(), order: maxOrder + 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  save(KEYS.watchlists, [...lists, list])
  return list
}

export function updateWatchlist(id, fields) {
  save(KEYS.watchlists, load(KEYS.watchlists).map(l => l.id === id ? { ...l, ...fields, updatedAt: new Date().toISOString() } : l))
}

export function deleteWatchlist(id) {
  recordDeletion(KEYS.watchlists, id)
  save(KEYS.watchlists, load(KEYS.watchlists).filter(l => l.id !== id))
  // Cascade-delete entries and their alerts
  const entries = load(KEYS.entries).filter(e => e.watchlistId === id)
  entries.forEach(e => deleteWatchlistEntry(e.id, { skipCascadeCheck: true }))
  save(KEYS.entries, load(KEYS.entries).filter(e => e.watchlistId !== id))
}

export function reorderWatchlists(orderedIds) {
  const lists = load(KEYS.watchlists)
  save(KEYS.watchlists, lists.map(l => {
    const order = orderedIds.indexOf(l.id)
    return order === l.order ? l : { ...l, order, updatedAt: new Date().toISOString() }
  }))
}

// ─── Watchlist entries ────────────────────────────────────────────────────────

export function getWatchlistEntries(watchlistId) {
  return load(KEYS.entries)
    .filter(e => e.watchlistId === watchlistId)
    .sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt))
}

export function getAllWatchlistEntries() {
  return load(KEYS.entries)
}

export function getWatchlistEntry(entryId) {
  return load(KEYS.entries).find(e => e.id === entryId) ?? null
}

export function addStockToWatchlist(watchlistId, ticker) {
  const t = ticker.trim().toUpperCase()
  const entries = load(KEYS.entries)
  if (entries.some(e => e.watchlistId === watchlistId && e.ticker === t)) {
    throw new Error('Already on this list')
  }
  const entry = { id: nanoid(), watchlistId, ticker: t, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  save(KEYS.entries, [...entries, entry])
  return entry
}

export function deleteWatchlistEntry(entryId) {
  recordDeletion(KEYS.entries, entryId)
  load(KEYS.alerts).filter(a => a.watchlistEntryId === entryId).forEach(a => recordDeletion(KEYS.alerts, a.id))
  save(KEYS.entries, load(KEYS.entries).filter(e => e.id !== entryId))
  save(KEYS.alerts, load(KEYS.alerts).filter(a => a.watchlistEntryId !== entryId))
}

// Removes all entries (and their alerts) for a ticker across every watchlist.
// Called when a stock profile is archived so the stock disappears from all watchlists.
export function deleteWatchlistEntriesForTicker(ticker) {
  const t = ticker.trim().toUpperCase()
  const removed = new Set(load(KEYS.entries).filter(e => e.ticker === t).map(e => e.id))
  removed.forEach(entryId => recordDeletion(KEYS.entries, entryId))
  load(KEYS.alerts).filter(a => removed.has(a.watchlistEntryId)).forEach(a => recordDeletion(KEYS.alerts, a.id))
  save(KEYS.entries, load(KEYS.entries).filter(e => e.ticker !== t))
  save(KEYS.alerts, load(KEYS.alerts).filter(a => !removed.has(a.watchlistEntryId)))
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export function getAlertsForEntry(watchlistEntryId) {
  return load(KEYS.alerts)
    .filter(a => a.watchlistEntryId === watchlistEntryId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

export function getAllAlerts() {
  return load(KEYS.alerts)
}

export function getArmedAlerts() {
  return load(KEYS.alerts).filter(a => a.status === 'armed')
}

export function getTriggeredAlertCount() {
  return load(KEYS.alerts).filter(a => a.status === 'triggered').length
}

export function createAlert(watchlistEntryId, { direction, threshold, currency }) {
  const alert = {
    id: nanoid(),
    watchlistEntryId,
    direction,      // 'above' | 'below'
    threshold: Number(threshold),
    currency,
    status: 'armed',
    createdAt: new Date().toISOString(),
    triggeredAt: null,
    updatedAt: new Date().toISOString(),
  }
  save(KEYS.alerts, [...load(KEYS.alerts), alert])
  return alert
}

export function updateAlert(id, fields) {
  save(KEYS.alerts, load(KEYS.alerts).map(a => a.id === id ? { ...a, ...fields, updatedAt: new Date().toISOString() } : a))
}

export function deleteAlert(id) {
  recordDeletion(KEYS.alerts, id)
  save(KEYS.alerts, load(KEYS.alerts).filter(a => a.id !== id))
}

export function triggerAlert(id) {
  updateAlert(id, { status: 'triggered', triggeredAt: new Date().toISOString() })
}

export function rearmAlert(id) {
  updateAlert(id, { status: 'armed', triggeredAt: null })
}

// Evaluate all armed alerts against a price map { [ticker]: currentPrice }
// Returns array of newly-triggered alert ids
export function evaluateAlerts(priceMap) {
  const alerts = load(KEYS.alerts)
  const entries = load(KEYS.entries)
  const entryById = Object.fromEntries(entries.map(e => [e.id, e]))

  const newlyTriggered = []
  const updated = alerts.map(a => {
    if (a.status !== 'armed') return a
    const entry = entryById[a.watchlistEntryId]
    if (!entry) return a
    const price = priceMap[entry.ticker]
    if (price == null) return a

    const hit = a.direction === 'above' ? price >= a.threshold : price <= a.threshold
    if (hit) {
      newlyTriggered.push(a.id)
      return { ...a, status: 'triggered', triggeredAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    }
    return a
  })

  if (newlyTriggered.length > 0) save(KEYS.alerts, updated)
  return newlyTriggered
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function getWatchlistStorageBytes() {
  const lists   = appStorage.getItem(KEYS.watchlists) ?? '[]'
  const entries = appStorage.getItem(KEYS.entries)    ?? '[]'
  const alerts  = appStorage.getItem(KEYS.alerts)     ?? '[]'
  return (
    new Blob([lists]).size +
    new Blob([entries]).size +
    new Blob([alerts]).size
  )
}

export function getWatchlistStorageSummary() {
  const lists   = load(KEYS.watchlists)
  const entries = load(KEYS.entries)
  const alerts  = load(KEYS.alerts)
  return {
    listCount:  lists.length,
    stockCount: entries.length,
    alertCount: alerts.length,
    bytes:      getWatchlistStorageBytes(),
  }
}

export function deleteAllWatchlists() {
  load(KEYS.watchlists).forEach(l => recordDeletion(KEYS.watchlists, l.id))
  load(KEYS.entries).forEach(e => recordDeletion(KEYS.entries, e.id))
  load(KEYS.alerts).forEach(a => recordDeletion(KEYS.alerts, a.id))
  save(KEYS.watchlists, [])
  save(KEYS.entries, [])
  save(KEYS.alerts, [])
}
