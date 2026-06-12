import appStorage from '../utils/appStorage'
import { localDateStr } from '../utils/dates'

const KEY_ENVELOPES  = 'rmoney_envelopes'
const KEY_TRANSFERS  = 'rmoney_envelope_transfers'
const KEY_SCHEDULED  = 'rmoney_envelope_scheduled'

// ─── Helpers ────────────────────────────────────────────────────────────────

function load(key) {
  try { return JSON.parse(appStorage.getItem(key)) ?? [] } catch { return [] }
}

function save(key, data) {
  appStorage.setItem(key, JSON.stringify(data))
}

function generateId() {
  return crypto.randomUUID()
}

// Coerce an `amount` field to a number when present, so a string coming from a
// form input never gets persisted (string amounts corrupt the balance sums,
// which add with `+` — see migrateTransferAmounts below).
function coerceAmount(fields) {
  if (fields && fields.amount !== undefined) {
    return { ...fields, amount: Number(fields.amount) }
  }
  return fields
}

function sortAlpha(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

// Returns envelopes as a flat list in tree order with depth, alphabetical within each level.
// Used for indented dropdowns.
export function getEnvelopesFlat(envelopes) {
  const result = []
  function walk(parentId, depth) {
    const children = sortAlpha(envelopes.filter(e => e.parentId === parentId))
    for (const child of children) {
      result.push({ ...child, depth })
      walk(child.id, depth + 1)
    }
  }
  // Built-ins first, then user envelopes
  const builtIns = sortAlpha(envelopes.filter(e => e.isBuiltIn && !e.parentId))
  for (const b of builtIns) result.push({ ...b, depth: 0 })
  walk(null, 0)
  return result.filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i) // dedupe
}

// Returns all descendant envelopes of a given id
export function getDescendants(id, all) {
  const children = all.filter(e => e.parentId === id)
  return children.flatMap(child => [child, ...getDescendants(child.id, all)])
}

// Returns the ancestor path (root → leaf) of envelope NAMES for an id, e.g.
// ['Household', 'Food', 'Groceries'] (Phase 49e). `all` may include archived
// envelopes so historical transactions still resolve their full path. Pass an
// already-loaded list to avoid re-reading storage per call.
export function getEnvelopePath(id, all = getEnvelopes()) {
  const byId = new Map(all.map(e => [e.id, e]))
  const names = []
  let cur = byId.get(id)
  let guard = 0
  while (cur && guard++ < 100) {
    names.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : null
  }
  return names
}

// "Household › Food › Groceries" — the full path joined with the given separator
// (default the right-angle quote, surrounded by spaces). Empty string if the id
// resolves to nothing.
export function envelopePathLabel(id, sep = '›', all) {
  return getEnvelopePath(id, all).join(` ${sep} `)
}

// ─── Envelopes ───────────────────────────────────────────────────────────────

export function getEnvelopes() {
  return sortAlpha(load(KEY_ENVELOPES))
}

export function getActiveEnvelopes() {
  return sortAlpha(load(KEY_ENVELOPES).filter(e => !e.isArchived))
}

export function initBuiltInEnvelopes() {
  const existing = load(KEY_ENVELOPES)
  if (existing.some(e => e.isBuiltIn)) return  // already initialised

  const builtIns = [
    {
      id: generateId(),
      name: 'Undistributed income',
      parentId: null,
      isBuiltIn: true,
      isDefaultIncome: true,
      isDefaultExpense: false,
      isArchived: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Unassigned expenses',
      parentId: null,
      isBuiltIn: true,
      isDefaultIncome: false,
      isDefaultExpense: true,
      isArchived: false,
      createdAt: new Date().toISOString(),
    },
  ]
  save(KEY_ENVELOPES, [...existing, ...builtIns])
}

export function createEnvelope({ name, parentId }) {
  const envelopes = load(KEY_ENVELOPES)
  const envelope = {
    id: generateId(),
    name,
    parentId: parentId ?? null,
    isBuiltIn: false,
    isDefaultIncome: false,
    isDefaultExpense: false,
    isArchived: false,
    createdAt: new Date().toISOString(),
  }
  save(KEY_ENVELOPES, [...envelopes, envelope])
  return envelope
}

export function updateEnvelope(id, fields) {
  const envelopes = load(KEY_ENVELOPES)
  save(KEY_ENVELOPES, envelopes.map(e => e.id === id ? { ...e, ...fields } : e))
}

export function archiveEnvelope(id, { newDefaultIncomeId, newDefaultExpenseId } = {}) {
  const envelopes = load(KEY_ENVELOPES)
  const target = envelopes.find(e => e.id === id)

  let updated = envelopes.map(e => {
    if (e.id === id) return { ...e, isArchived: true }
    // Reassign defaults if the archived envelope was a default
    if (target?.isDefaultIncome && e.id === newDefaultIncomeId)
      return { ...e, isDefaultIncome: true }
    if (target?.isDefaultExpense && e.id === newDefaultExpenseId)
      return { ...e, isDefaultExpense: true }
    return e
  })

  // Clear old default flags from archived envelope
  updated = updated.map(e =>
    e.id === id ? { ...e, isDefaultIncome: false, isDefaultExpense: false } : e
  )

  save(KEY_ENVELOPES, updated)
}

export function deleteEnvelope(id) {
  const envelopes = load(KEY_ENVELOPES)
  if (envelopes.find(e => e.id === id)?.isBuiltIn) return  // built-ins cannot be deleted
  const toDelete = new Set([id, ...getDescendants(id, envelopes).map(e => e.id)])
  save(KEY_ENVELOPES, envelopes.filter(e => !toDelete.has(e.id)))
}

export function getDefaultIncomeEnvelope() {
  return load(KEY_ENVELOPES).find(e => e.isDefaultIncome && !e.isArchived) ?? null
}

export function getDefaultExpenseEnvelope() {
  return load(KEY_ENVELOPES).find(e => e.isDefaultExpense && !e.isArchived) ?? null
}

// ─── Envelope balance ────────────────────────────────────────────────────────

export function getEnvelopeBalance(envelopeId) {
  // Envelope transfers (reallocation between envelopes)
  const transfers = load(KEY_TRANSFERS)
  const transferIn  = transfers.filter(t => t.toEnvelopeId   === envelopeId).reduce((s, t) => s + Number(t.amount), 0)
  const transferOut = transfers.filter(t => t.fromEnvelopeId === envelopeId).reduce((s, t) => s + Number(t.amount), 0)

  // Transactions assigned to this envelope
  const KEY_TRANSACTIONS = 'rmoney_transactions'
  const txs = (() => { try { return JSON.parse(appStorage.getItem(KEY_TRANSACTIONS)) ?? [] } catch { return [] } })()
  const envelope = load(KEY_ENVELOPES).find(e => e.id === envelopeId)

  // Match transactions: explicitly assigned to this envelope,
  // OR unassigned transactions that belong to the default envelope
  const assigned = txs.filter(t => {
    if (t.type !== 'income' && t.type !== 'expense') return false
    if (t.envelopeId === envelopeId) return true
    // Unassigned transactions go to defaults
    if (!t.envelopeId) {
      if (t.type === 'income'  && envelope?.isDefaultIncome)  return true
      if (t.type === 'expense' && envelope?.isDefaultExpense) return true
    }
    return false
  })

  const txIn  = assigned.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const txOut = assigned.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  // Account starting balances — these are "initial money" that lives in the
  // default income envelope until the user distributes it
  let startingBalances = 0
  if (envelope?.isDefaultIncome) {
    const KEY_ACCOUNTS = 'rmoney_accounts'
    const accounts = (() => { try { return JSON.parse(appStorage.getItem(KEY_ACCOUNTS)) ?? [] } catch { return [] } })()
    startingBalances = accounts.reduce((sum, a) => sum + Number(a.startingBalance), 0)
  }

  return (transferIn + txIn + startingBalances) - (transferOut + txOut)
}

export function getDescendantIds(envelopeId) {
  const all = load(KEY_ENVELOPES)
  return getDescendants(envelopeId, all).map(e => e.id)
}

export function getTotalEnvelopeBalance(envelopeId) {
  const all = load(KEY_ENVELOPES)
  const descendantIds = getDescendants(envelopeId, all).map(e => e.id)
  return [envelopeId, ...descendantIds].reduce((sum, id) => sum + getEnvelopeBalance(id), 0)
}

// Returns { [currency]: balance } across all active envelope balances combined.
// Transfers between envelopes cancel out; only income/expense transactions
// and account starting balances are tracked by currency.
export function getEnvelopesTotalByCurrency() {
  const KEY_TRANSACTIONS = 'rmoney_transactions'
  const KEY_ACCOUNTS = 'rmoney_accounts'
  const txs = (() => { try { return JSON.parse(appStorage.getItem(KEY_TRANSACTIONS)) ?? [] } catch { return [] } })()
  const accounts = (() => { try { return JSON.parse(appStorage.getItem(KEY_ACCOUNTS)) ?? [] } catch { return [] } })()
  const result = {}
  for (const a of accounts.filter(a => !a.isArchived)) {
    const cur = a.currency || 'EUR'
    result[cur] = (result[cur] ?? 0) + Number(a.startingBalance)
  }
  for (const tx of txs) {
    if (tx.type === 'income') {
      const cur = tx.currency || 'EUR'
      result[cur] = (result[cur] ?? 0) + Number(tx.amount)
    } else if (tx.type === 'expense') {
      const cur = tx.currency || 'EUR'
      result[cur] = (result[cur] ?? 0) - Number(tx.amount)
    }
  }
  return result
}

// ─── Envelope transfers ──────────────────────────────────────────────────────

export function getEnvelopeTransfers() {
  return load(KEY_TRANSFERS).sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function getTransfersForEnvelope(envelopeId) {
  return load(KEY_TRANSFERS)
    .filter(t => t.fromEnvelopeId === envelopeId || t.toEnvelopeId === envelopeId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function createEnvelopeTransfer({ fromEnvelopeId, toEnvelopeId, amount, date, note }) {
  const transfers = load(KEY_TRANSFERS)
  const transfer = {
    id: generateId(),
    fromEnvelopeId,
    toEnvelopeId,
    amount: Number(amount),
    date: date ?? new Date().toISOString().split('T')[0],
    note: note ?? '',
    createdAt: new Date().toISOString(),
  }
  save(KEY_TRANSFERS, [...transfers, transfer])
  return transfer
}

export function updateEnvelopeTransfer(id, fields) {
  const patch = coerceAmount(fields)
  const transfers = load(KEY_TRANSFERS)
  save(KEY_TRANSFERS, transfers.map(t => t.id === id ? { ...t, ...patch } : t))
}

export function deleteEnvelopeTransfer(id) {
  const transfers = load(KEY_TRANSFERS)
  save(KEY_TRANSFERS, transfers.filter(t => t.id !== id))
}

// ─── Scheduled transfers ─────────────────────────────────────────────────────

export function getScheduledTransfers() {
  return load(KEY_SCHEDULED)
}

export function createScheduledTransfer({ fromEnvelopeId, toEnvelopeId, amount, frequency, dayOfExecution }) {
  const scheduled = load(KEY_SCHEDULED)
  const item = {
    id: generateId(),
    fromEnvelopeId,
    toEnvelopeId,
    amount: Number(amount),
    frequency,
    dayOfExecution: Number(dayOfExecution),
    isActive: true,
    lastExecutedDate: null,
    createdAt: new Date().toISOString(),
  }
  save(KEY_SCHEDULED, [...scheduled, item])
  return item
}

// Local midnight for a date (strips time-of-day).
function atMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Whole months between two dates (anchor → today), used to space out the
// quarterly (every 3) and yearly (every 12) cadences from the rule's anchor.
function monthsBetween(anchor, today) {
  return (today.getFullYear() - anchor.getFullYear()) * 12 + (today.getMonth() - anchor.getMonth())
}

// Does a scheduled transfer fall due on `today`?
//   weekly    → matching weekday
//   biweekly  → matching weekday AND an even number of weeks from the anchor
//               (first matching weekday on/after createdAt)
//   monthly   → matching day-of-month (1–28, so no month-length clamping needed)
//   quarterly → matching day-of-month, in a month 0/3/6/9 from the anchor month
//   yearly    → matching day-of-month, in the anchor month
// Quarterly/yearly/biz anchor on `createdAt` (scheduled transfers have no
// startDate field); monthly/weekly need no anchor.
function isScheduledTransferDueToday(s, today) {
  const dow = today.getDay()
  const dom = today.getDate()
  switch (s.frequency) {
    case 'weekly':
      return dow === s.dayOfExecution
    case 'biweekly': {
      if (dow !== s.dayOfExecution) return false
      const created = atMidnight(new Date(s.createdAt))
      const daysUntil = (s.dayOfExecution - created.getDay() + 7) % 7
      const anchor = new Date(created)
      anchor.setDate(anchor.getDate() + daysUntil)
      const diffDays = Math.round((atMidnight(today) - anchor) / 86400000)
      return diffDays >= 0 && diffDays % 14 === 0
    }
    case 'monthly':
      return dom === s.dayOfExecution
    case 'quarterly':
      return dom === s.dayOfExecution && monthsBetween(new Date(s.createdAt), today) % 3 === 0
    case 'yearly':
      return dom === s.dayOfExecution && monthsBetween(new Date(s.createdAt), today) % 12 === 0
    default:
      return false
  }
}

// The next date (local YYYY-MM-DD) on or after `fromDate` on which a scheduled
// transfer fires, across every frequency. Rather than re-deriving per-frequency
// next-date math, it scans forward day-by-day reusing the same due-check the
// engine uses — so what the list shows as "next" always matches what actually
// fires. Returns null only for an unrecognised frequency. (Phase 49b)
export function nextScheduledOccurrence(s, fromDate = new Date()) {
  const start = atMidnight(fromDate)
  for (let i = 0; i < 800; i++) {   // 800 days > any single-frequency gap (yearly)
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    if (isScheduledTransferDueToday(s, d)) return localDateStr(d)
  }
  return null
}

export function runDueScheduledTransfers() {
  const today = new Date()
  const todayStr = localDateStr(today)

  const scheduled = load(KEY_SCHEDULED)
  const transfers = load(KEY_TRANSFERS)
  const newTransfers = []

  const updatedScheduled = scheduled.map(s => {
    if (!s.isActive) return s
    if (s.lastExecutedDate === todayStr) return s  // already ran today

    if (!isScheduledTransferDueToday(s, today)) return s

    newTransfers.push({
      id: generateId(),
      fromEnvelopeId: s.fromEnvelopeId,
      toEnvelopeId: s.toEnvelopeId,
      amount: s.amount,
      date: todayStr,
      note: `Scheduled (${s.frequency})`,
      isScheduled: true,
      createdAt: new Date().toISOString(),
    })
    return { ...s, lastExecutedDate: todayStr }
  })

  if (newTransfers.length > 0) {
    save(KEY_TRANSFERS, [...transfers, ...newTransfers])
    save(KEY_SCHEDULED, updatedScheduled)
  }
}

export function updateScheduledTransfer(id, fields) {
  const patch = coerceAmount(fields)
  const scheduled = load(KEY_SCHEDULED)
  save(KEY_SCHEDULED, scheduled.map(s => s.id === id ? { ...s, ...patch } : s))
}

export function deleteScheduledTransfer(id) {
  const scheduled = load(KEY_SCHEDULED)
  save(KEY_SCHEDULED, scheduled.filter(s => s.id !== id))
}

// ─── Migration: remove invalid self-transfers ────────────────────────────────
// An older version of the Planning page (SPEC-009, pre-fix) generated scheduled
// transfers for planned incomes with fromEnvelopeId === toEnvelopeId (both
// pointing at Undistributed income). These are invalid and cannot be edited in
// the UI. Remove them once on startup. Returns the list of removed transfer ids
// so callers (planning.js) can clear any stale link references.
export function cleanupSelfScheduledTransfers() {
  const scheduled = load(KEY_SCHEDULED)
  const toRemove = scheduled.filter(s => s.fromEnvelopeId === s.toEnvelopeId)
  if (toRemove.length === 0) return []
  const keep = scheduled.filter(s => s.fromEnvelopeId !== s.toEnvelopeId)
  save(KEY_SCHEDULED, keep)
  return toRemove.map(s => s.id)
}

// ─── Migration: coerce string amounts to numbers ─────────────────────────────
// The one-time-transfer *edit* form used to persist `amount` as the raw string
// from its <input>, and updateEnvelopeTransfer merged it verbatim. Because the
// balance sums add amounts with `+`, a stored string turned addition into string
// concatenation — producing wildly wrong totals and, once two decimal amounts
// combined into a two-dot string, `NaN`. Write/read paths now coerce (Phase 43a/
// 43b); this one-time pass repairs any already-stored string amounts so old data
// is correct without the user re-saving each record. Only finite values are
// rewritten, so a malformed string is left untouched rather than turned into NaN.
export function migrateTransferAmounts() {
  const coerceList = (items) => {
    let changed = false
    const fixed = items.map(item => {
      if (typeof item.amount === 'string') {
        const n = Number(item.amount)
        if (Number.isFinite(n)) { changed = true; return { ...item, amount: n } }
      }
      return item
    })
    return { fixed, changed }
  }

  const transfers = coerceList(load(KEY_TRANSFERS))
  if (transfers.changed) save(KEY_TRANSFERS, transfers.fixed)

  const scheduled = coerceList(load(KEY_SCHEDULED))
  if (scheduled.changed) save(KEY_SCHEDULED, scheduled.fixed)
}
