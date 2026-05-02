// Bills & Income — planned account transactions + pending occurrences.
// SPEC-013

import { createTransaction } from './transactions'

const KEY_ITEMS    = 'rmoney_bill_items'
const KEY_PENDING  = 'rmoney_bill_pending'

function generateId() { return `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }
function load(key)     { try { return JSON.parse(localStorage.getItem(key)) ?? [] } catch { return [] } }
function save(key, v)  { localStorage.setItem(key, JSON.stringify(v)) }

// Always use the LOCAL calendar date (not UTC) so that midnight local time
// doesn't flip to the previous date when serialized via toISOString().
function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Planned items CRUD ───────────────────────────────────────────────────────

export function getPlannedItems() { return load(KEY_ITEMS) }

export function createPlannedItem(fields) {
  const items = load(KEY_ITEMS)
  const item = { id: generateId(), isActive: true, createdAt: new Date().toISOString(), ...fields }
  save(KEY_ITEMS, [...items, item])
  return item
}

export function updatePlannedItem(id, fields) {
  save(KEY_ITEMS, load(KEY_ITEMS).map(i => i.id === id ? { ...i, ...fields } : i))
}

export function deletePlannedItem(id) {
  save(KEY_ITEMS, load(KEY_ITEMS).filter(i => i.id !== id))
  // Also remove any pending occurrences for this item
  save(KEY_PENDING, load(KEY_PENDING).filter(p => p.plannedItemId !== id))
}

// ── Pending occurrences CRUD ─────────────────────────────────────────────────

export function getPendingOccurrences() { return load(KEY_PENDING) }

export function confirmOccurrence(occId, actualAmount, itemFields) {
  const pending = load(KEY_PENDING)
  const occ = pending.find(p => p.id === occId)
  // Guard: skip if already confirmed or skipped (prevents duplicate transactions on double-click)
  if (!occ || occ.status !== 'pending') return null

  const tx = createTransaction({
    ...itemFields,
    amount: actualAmount,
  })
  save(KEY_PENDING, pending.map(p =>
    p.id === occId
      ? { ...p, status: 'confirmed', actualAmount, confirmedAt: new Date().toISOString(), transactionId: tx.id }
      : p
  ))
  return tx
}

export function skipOccurrence(occId) {
  const pending = load(KEY_PENDING)
  save(KEY_PENDING, pending.map(p => p.id === occId ? { ...p, status: 'skipped' } : p))
}

// ── Date helpers ─────────────────────────────────────────────────────────────

// Returns the last calendar day of month `month0` (0-indexed) in `year`.
// e.g. lastDayOf(2024, 1) = 29 (February 2024, leap year)
function lastDayOf(year, month0) {
  return new Date(year, month0 + 1, 0).getDate()
}

// Clamp `day` to the actual last day of the given month, so e.g.
// day=31 in April (30 days) becomes 30 instead of overflowing to May 1.
function clampDay(year, month0, day) {
  return Math.min(day, lastDayOf(year, month0))
}

// Returns all due dates (local YYYY-MM-DD strings) for a planned item
// from startDate up to and including untilDate (both local date strings).
function getDueDates(item, untilDate) {
  if (item.frequency === 'one-time') {
    return item.date && item.date <= untilDate ? [item.date] : []
  }

  const dates     = []
  const startDate = item.startDate  // local date string
  const endDate   = item.endDate ?? untilDate
  const cap       = endDate < untilDate ? endDate : untilDate

  if (item.frequency === 'monthly') {
    const day = item.dayOfExecution
    // Build first candidate date: same month as startDate, on the execution day.
    // Use local Date constructor (year/month/day) so there's no UTC offset.
    // Clamp day to the last day of the target month so e.g. day=31 in April
    // produces Apr 30 rather than overflowing into May.
    const [sy, sm] = startDate.split('-').map(Number)
    let m0 = sm - 1  // 0-indexed month
    let d = new Date(sy, m0, clampDay(sy, m0, day))
    // If this candidate is before startDate, move to next month
    if (localDateStr(d) < startDate) {
      m0 = sm  // next month (sm is already 1-based, so sm === m0 + 1)
      const ny = m0 > 11 ? sy + 1 : sy
      const nm = m0 % 12
      d = new Date(ny, nm, clampDay(ny, nm, day))
    }
    while (localDateStr(d) <= cap) {
      dates.push(localDateStr(d))
      const ny = d.getFullYear()
      const nm = (d.getMonth() + 1) % 12
      const nextYear = d.getMonth() === 11 ? ny + 1 : ny
      d = new Date(nextYear, nm, clampDay(nextYear, nm, day))
    }

  } else if (item.frequency === 'weekly') {
    const [sy, sm, sd2] = startDate.split('-').map(Number)
    let d = new Date(sy, sm - 1, sd2)
    const targetDay = item.dayOfExecution // 0=Sun … 6=Sat
    const daysUntil = (targetDay - d.getDay() + 7) % 7
    d.setDate(d.getDate() + daysUntil)
    while (localDateStr(d) <= cap) {
      dates.push(localDateStr(d))
      d = new Date(d)
      d.setDate(d.getDate() + 7)
    }

  } else if (item.frequency === 'quarterly') {
    const day = item.dayOfExecution
    const [sy, sm] = startDate.split('-').map(Number)
    let m0 = sm - 1
    let d = new Date(sy, m0, clampDay(sy, m0, day))
    if (localDateStr(d) < startDate) {
      // Advance by 3 months
      const raw = new Date(sy, m0 + 3, 1)
      const ny = raw.getFullYear(); const nm = raw.getMonth()
      d = new Date(ny, nm, clampDay(ny, nm, day))
    }
    while (localDateStr(d) <= cap) {
      dates.push(localDateStr(d))
      const raw = new Date(d.getFullYear(), d.getMonth() + 3, 1)
      const ny = raw.getFullYear(); const nm = raw.getMonth()
      d = new Date(ny, nm, clampDay(ny, nm, day))
    }

  } else if (item.frequency === 'yearly') {
    const [sy, sm] = startDate.split('-').map(Number)
    const execDay = item.dayOfExecution ?? Number(startDate.split('-')[2])
    const m0 = sm - 1
    let d = new Date(sy, m0, clampDay(sy, m0, execDay))
    if (localDateStr(d) < startDate) d = new Date(sy + 1, m0, clampDay(sy + 1, m0, execDay))
    while (localDateStr(d) <= cap) {
      dates.push(localDateStr(d))
      const ny = d.getFullYear() + 1
      d = new Date(ny, m0, clampDay(ny, m0, execDay))
    }
  }

  return dates
}

// Returns the next due date for an item strictly after today (local YYYY-MM-DD string or null).
export function getNextOccurrenceDate(item) {
  const todayStr = localDateStr()

  if (item.frequency === 'one-time') {
    return item.date > todayStr ? item.date : null
  }

  const today = new Date()

  if (item.frequency === 'monthly') {
    const day = item.dayOfExecution
    let d = new Date(today.getFullYear(), today.getMonth(), day)
    if (localDateStr(d) <= todayStr) {
      d = new Date(today.getFullYear(), today.getMonth() + 1, day)
    }
    if (item.endDate && localDateStr(d) > item.endDate) return null
    return localDateStr(d)
  }

  if (item.frequency === 'weekly') {
    const targetDay = item.dayOfExecution
    const daysUntil = (targetDay - today.getDay() + 7) % 7 || 7
    const d = new Date(today)
    d.setDate(d.getDate() + daysUntil)
    if (item.endDate && localDateStr(d) > item.endDate) return null
    return localDateStr(d)
  }

  if (item.frequency === 'quarterly') {
    const [sy, sm] = item.startDate.split('-').map(Number)
    let d = new Date(sy, sm - 1, item.dayOfExecution)
    while (localDateStr(d) <= todayStr) {
      d = new Date(d.getFullYear(), d.getMonth() + 3, item.dayOfExecution)
    }
    if (item.endDate && localDateStr(d) > item.endDate) return null
    return localDateStr(d)
  }

  if (item.frequency === 'yearly') {
    const [, sm] = item.startDate.split('-').map(Number)
    const day = item.dayOfExecution ?? Number(item.startDate.split('-')[2])
    let d = new Date(today.getFullYear(), sm - 1, day)
    if (localDateStr(d) <= todayStr) {
      d = new Date(today.getFullYear() + 1, sm - 1, day)
    }
    if (item.endDate && localDateStr(d) > item.endDate) return null
    return localDateStr(d)
  }

  return null
}

// Returns the next single occurrence per active item, sorted by date.
// Items that have a pending (outstanding) occurrence are excluded entirely.
export function getUpcomingOccurrences() {
  const items   = load(KEY_ITEMS).filter(i => i.isActive)
  const pending = load(KEY_PENDING)

  // Build set of item IDs that currently have an unconfirmed outstanding occurrence
  const pendingItemIds = new Set(
    pending.filter(p => p.status === 'pending').map(p => p.plannedItemId)
  )

  const todayStr = localDateStr()

  const occurrences = []
  for (const item of items) {
    // Skip items with an outstanding pending occurrence
    if (pendingItemIds.has(item.id)) continue

    const next = getNextOccurrenceDate(item)
    if (next && next > todayStr) {
      occurrences.push({ date: next, item })
    }
  }

  return occurrences.sort((a, b) => a.date.localeCompare(b.date))
}

// ── Recurring engine (called on app open) ────────────────────────────────────

export function checkAndGeneratePending() {
  const todayStr = localDateStr()
  const items    = load(KEY_ITEMS).filter(i => i.isActive)
  const pending  = load(KEY_PENDING)

  // Build a set of (plannedItemId, dueDate) pairs already handled
  const handled = new Set(pending.map(p => `${p.plannedItemId}__${p.dueDate}`))

  const newPending = []
  const newPendingForConfirm = [] // auto-apply items needing immediate transaction creation

  for (const item of items) {
    const dueDates = getDueDates(item, todayStr)
    for (const dueDate of dueDates) {
      const key = `${item.id}__${dueDate}`
      if (handled.has(key)) continue

      const occ = {
        id:            `occ_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        plannedItemId: item.id,
        dueDate,
        plannedAmount: item.amount,
        actualAmount:  null,
        status:        item.applicationMode === 'auto-apply' ? 'confirmed' : 'pending',
        confirmedAt:   item.applicationMode === 'auto-apply' ? new Date().toISOString() : null,
        transactionId: null,
      }

      if (item.applicationMode === 'auto-apply') {
        newPendingForConfirm.push({ occ, item, dueDate })
      } else {
        newPending.push(occ)
      }
    }
  }

  // Create transactions for auto-apply items
  for (const { occ, item, dueDate } of newPendingForConfirm) {
    const tx = createTransaction({
      type:        item.type,
      accountId:   item.accountId,
      amount:      item.amount,
      currency:    item.currency,
      categoryId:  item.categoryId ?? null,
      envelopeId:  item.envelopeId ?? null,
      payeeName:   item.payee ?? '',
      note:        item.name,
      date:        dueDate,
      isPlanned:   true,
    })
    newPending.push({ ...occ, transactionId: tx.id })
  }

  if (newPending.length > 0) {
    save(KEY_PENDING, [...pending, ...newPending])
  }
}
