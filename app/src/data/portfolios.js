import { recordDeletion } from './syncMeta'
import appStorage from '../utils/appStorage'

const KEY_PORTFOLIOS  = 'rmoney_portfolios'
const KEY_ASSIGNMENTS = 'rmoney_portfolio_assignments'

function load(key) {
  try { return JSON.parse(appStorage.getItem(key)) ?? [] } catch { return [] }
}
function save(key, data) { appStorage.setItem(key, JSON.stringify(data)) }

// ─── Portfolio nodes ──────────────────────────────────────────────────────────

export function getPortfolios() {
  return load(KEY_PORTFOLIOS)
}

export function getPortfolio(id) {
  return load(KEY_PORTFOLIOS).find(p => p.id === id) ?? null
}

// Flat tree in display order: depth-first, sorted by order within siblings
export function getPortfoliosFlat() {
  const all = load(KEY_PORTFOLIOS)
  const result = []
  function walk(parentId, depth) {
    const children = all
      .filter(p => p.parentId === parentId)
      .sort((a, b) => a.order - b.order)
    for (const child of children) {
      result.push({ ...child, depth })
      walk(child.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}

function maxSiblingOrder(parentId) {
  const siblings = load(KEY_PORTFOLIOS).filter(p => p.parentId === parentId)
  if (siblings.length === 0) return 0
  return Math.max(...siblings.map(p => p.order))
}

export function createPortfolio({ parentId = null, name, targetPercent = null }) {
  const all = load(KEY_PORTFOLIOS)
  const item = {
    id: crypto.randomUUID(),
    parentId: parentId ?? null,
    name: name.trim(),
    order: maxSiblingOrder(parentId ?? null) + 1,
    targetPercent: (targetPercent !== null && targetPercent !== '') ? Number(targetPercent) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save(KEY_PORTFOLIOS, [...all, item])
  return item
}

export function updatePortfolio(id, fields) {
  const all = load(KEY_PORTFOLIOS)
  save(KEY_PORTFOLIOS, all.map(p => {
    if (p.id !== id) return p
    const updated = { ...p }
    if (fields.name !== undefined) updated.name = fields.name.trim()
    if ('targetPercent' in fields) {
      updated.targetPercent = (fields.targetPercent !== null && fields.targetPercent !== '')
        ? Number(fields.targetPercent) : null
    }
    updated.updatedAt = new Date().toISOString()
    return updated
  }))
}

export function reorderPortfolio(id, direction) {
  const all = load(KEY_PORTFOLIOS)
  const item = all.find(p => p.id === id)
  if (!item) return
  const siblings = all
    .filter(p => p.parentId === item.parentId)
    .sort((a, b) => a.order - b.order)
  const idx = siblings.findIndex(p => p.id === id)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= siblings.length) return
  const swapItem = siblings[swapIdx]
  save(KEY_PORTFOLIOS, all.map(p => {
    if (p.id === id)        return { ...p, order: swapItem.order, updatedAt: new Date().toISOString() }
    if (p.id === swapItem.id) return { ...p, order: item.order, updatedAt: new Date().toISOString() }
    return p
  }))
}

// DnD reparent — pass '__root__' as newParentId to move to root level
export function reparentPortfolio(id, newParentId) {
  const all = load(KEY_PORTFOLIOS)
  const item = all.find(p => p.id === id)
  if (!item) return
  const resolved = (newParentId === '__root__' || newParentId == null) ? null : newParentId
  if (item.parentId === resolved) return
  const newOrder = maxSiblingOrder(resolved) + 1
  save(KEY_PORTFOLIOS, all.map(p =>
    p.id === id ? { ...p, parentId: resolved, order: newOrder, updatedAt: new Date().toISOString() } : p
  ))
}

export function getPortfolioDeletePreview(id) {
  const all = load(KEY_PORTFOLIOS)
  const assignments = load(KEY_ASSIGNMENTS)

  const descendantIds = new Set()
  function collect(nodeId) {
    for (const p of all) {
      if (p.parentId === nodeId) {
        descendantIds.add(p.id)
        collect(p.id)
      }
    }
  }
  collect(id)

  const affectedIds = new Set([id, ...descendantIds])
  const removed = assignments.filter(a => affectedIds.has(a.portfolioId))
  const affectedTickers = [...new Set(removed.map(a => a.ticker))]
  const sharedElsewhere = affectedTickers.filter(ticker =>
    assignments.some(a => a.ticker === ticker && !affectedIds.has(a.portfolioId))
  )

  return { descendantCount: descendantIds.size, assignmentCount: removed.length, affectedTickers, sharedElsewhere }
}

export function deletePortfolio(id) {
  const all = load(KEY_PORTFOLIOS)
  const assignments = load(KEY_ASSIGNMENTS)

  const toDelete = new Set([id])
  function collect(nodeId) {
    for (const p of all) {
      if (p.parentId === nodeId) { toDelete.add(p.id); collect(p.id) }
    }
  }
  collect(id)

  toDelete.forEach(pid => recordDeletion(KEY_PORTFOLIOS, pid))
  assignments.filter(a => toDelete.has(a.portfolioId)).forEach(a => recordDeletion(KEY_ASSIGNMENTS, a.id))
  save(KEY_PORTFOLIOS, all.filter(p => !toDelete.has(p.id)))
  save(KEY_ASSIGNMENTS, assignments.filter(a => !toDelete.has(a.portfolioId)))
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export function getPortfolioAssignments(portfolioId) {
  return load(KEY_ASSIGNMENTS).filter(a => a.portfolioId === portfolioId)
}

export function getAllPortfolioAssignments() {
  return load(KEY_ASSIGNMENTS)
}

export function createPortfolioAssignment({ portfolioId, ticker, targetPercent = null }) {
  const all = load(KEY_ASSIGNMENTS)
  const norm = ticker.trim().toUpperCase()
  if (all.some(a => a.portfolioId === portfolioId && a.ticker === norm)) return null
  const item = {
    id: crypto.randomUUID(),
    portfolioId,
    ticker: norm,
    targetPercent: (targetPercent !== null && targetPercent !== '') ? Number(targetPercent) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save(KEY_ASSIGNMENTS, [...all, item])
  return item
}

export function updatePortfolioAssignment(id, { targetPercent }) {
  const all = load(KEY_ASSIGNMENTS)
  save(KEY_ASSIGNMENTS, all.map(a => a.id !== id ? a : {
    ...a,
    targetPercent: (targetPercent !== null && targetPercent !== '') ? Number(targetPercent) : null,
    updatedAt: new Date().toISOString(),
  }))
}

export function deletePortfolioAssignment(id) {
  recordDeletion(KEY_ASSIGNMENTS, id)
  save(KEY_ASSIGNMENTS, load(KEY_ASSIGNMENTS).filter(a => a.id !== id))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns unique tickers from all stock transactions (for autocomplete suggestions)
export function getKnownTickers() {
  try {
    const txns = JSON.parse(appStorage.getItem('rmoney_stock_transactions')) ?? []
    return [...new Set(txns.filter(t => t.type === 'buy').map(t => t.ticker))].sort()
  } catch { return [] }
}
