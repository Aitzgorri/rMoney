// Bills & Income — planned account transactions + pending occurrences.
// SPEC-013

import { createTransaction, updateTransaction } from './transactions'
import appStorage from '../utils/appStorage'
import { localDateStr } from '../utils/dates'
import { recordDeletion } from './syncMeta'

const KEY_ITEMS    = 'rmoney_bill_items'
const KEY_PENDING  = 'rmoney_bill_pending'

function generateId() { return `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }
function load(key)     { try { return JSON.parse(appStorage.getItem(key)) ?? [] } catch { return [] } }
function save(key, v)  { appStorage.setItem(key, JSON.stringify(v)) }

// ── Planned items CRUD ───────────────────────────────────────────────────────

export function getPlannedItems() { return load(KEY_ITEMS) }

export function createPlannedItem(fields) {
  const items = load(KEY_ITEMS)
  const item = { id: generateId(), isActive: true, createdAt: new Date().toISOString(), ...fields, updatedAt: new Date().toISOString() }
  save(KEY_ITEMS, [...items, item])
  return item
}

export function updatePlannedItem(id, fields) {
  save(KEY_ITEMS, load(KEY_ITEMS).map(i => i.id === id ? { ...i, ...fields, updatedAt: new Date().toISOString() } : i))
}

export function deletePlannedItem(id) {
  save(KEY_ITEMS, load(KEY_ITEMS).filter(i => i.id !== id))
  recordDeletion(KEY_ITEMS, id)
  // Also remove any pending occurrences for this item
  const pending = load(KEY_PENDING)
  save(KEY_PENDING, pending.filter(p => p.plannedItemId !== id))
  for (const p of pending.filter(p => p.plannedItemId === id)) {
    recordDeletion(KEY_PENDING, p.id)
  }
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
    isPlanned: true,   // Phase 52a: mark so it's excluded from the unscheduled projection average
  })
  save(KEY_PENDING, pending.map(p =>
    p.id === occId
      ? { ...p, status: 'confirmed', actualAmount, confirmedAt: new Date().toISOString(), transactionId: tx.id, updatedAt: new Date().toISOString() }
      : p
  ))
  return tx
}

export function skipOccurrence(occId) {
  const pending = load(KEY_PENDING)
  save(KEY_PENDING, pending.map(p => p.id === occId ? { ...p, status: 'skipped', updatedAt: new Date().toISOString() } : p))
}

// ── Past-records rewrite (Phase 55a — opt-in edit scope) ─────────────────────
// The item's already-recorded history: confirmed occurrences that hold a link
// to the transaction they created. Used to preview ("N records since {date}")
// and to apply an amount edit retroactively.

export function countPastConfirmedOccurrences(itemId) {
  const linked = load(KEY_PENDING)
    .filter(p => p.plannedItemId === itemId && p.status === 'confirmed' && p.transactionId)
  const since = linked.length > 0
    ? linked.map(p => p.dueDate).sort()[0]
    : null
  return { count: linked.length, since }
}

// Rewrites ONLY the amount (locked decision 2026-07-08): the linked
// transactions keep their dates, accounts, categories, envelopes and payees.
// Returns the number of transactions updated.
export function applyAmountToPastOccurrences(itemId, amount) {
  const pending = load(KEY_PENDING)
  const linked = pending.filter(p => p.plannedItemId === itemId && p.status === 'confirmed' && p.transactionId)
  for (const occ of linked) {
    updateTransaction(occ.transactionId, { amount })
  }
  if (linked.length > 0) {
    const linkedIds = new Set(linked.map(p => p.id))
    save(KEY_PENDING, pending.map(p => linkedIds.has(p.id) ? { ...p, actualAmount: amount, updatedAt: new Date().toISOString() } : p))
  }
  return linked.length
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
// Exported for the recurrence unit tests (Phase 57c) — pure, clock-free.
export function getDueDates(item, untilDate) {
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

  } else if (item.frequency === 'weekly' || item.frequency === 'biweekly') {
    // Bi-weekly = fortnightly: same as weekly but step 14 days. Anchored to the
    // first matching weekday on/after startDate so the parity (which week) is
    // deterministic.
    const step = item.frequency === 'biweekly' ? 14 : 7
    const [sy, sm, sd2] = startDate.split('-').map(Number)
    let d = new Date(sy, sm - 1, sd2)
    const targetDay = item.dayOfExecution // 0=Sun … 6=Sat
    const daysUntil = (targetDay - d.getDay() + 7) % 7
    d.setDate(d.getDate() + daysUntil)
    while (localDateStr(d) <= cap) {
      dates.push(localDateStr(d))
      d = new Date(d)
      d.setDate(d.getDate() + step)
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

  if (item.frequency === 'biweekly') {
    // Walk the fortnightly series from its anchor (first matching weekday
    // on/after startDate) until strictly after today, so the parity matches
    // getDueDates exactly.
    const [sy, sm, sd2] = item.startDate.split('-').map(Number)
    let d = new Date(sy, sm - 1, sd2)
    const daysUntil = (item.dayOfExecution - d.getDay() + 7) % 7
    d.setDate(d.getDate() + daysUntil)
    while (localDateStr(d) <= todayStr) {
      d = new Date(d)
      d.setDate(d.getDate() + 14)
    }
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

// ── Occurrence overrides (Phase 55d — one-time edits + skip) ─────────────────
// A recurring item may carry `overrides: { [seriesDate]: {date?, amount?, note?, skipped?} }`
// — a one-shot change to the single occurrence whose ORIGINAL schedule date is
// the key. The series itself is untouched; the engine consumes (prunes) an
// override once its occurrence is generated or skipped.

// The next occurrence the user will actually see for an item, with any override
// applied: skipped ones are passed over, date/amount/note overrides shine through.
// Returns { date, seriesDate, amount, note, overridden } or null.
export function getNextEffectiveOccurrence(item) {
  const todayStr = localDateStr()
  if (item.frequency === 'one-time') {
    return item.date && item.date > todayStr
      ? { date: item.date, seriesDate: item.date, amount: item.amount, note: null, overridden: false }
      : null
  }
  const ov = item.overrides ?? {}
  const horizonD = new Date()
  horizonD.setFullYear(horizonD.getFullYear() + 2)   // ≥1 occurrence even for yearly
  const candidates = getDueDates(item, localDateStr(horizonD))
    .filter(seriesDate => !ov[seriesDate]?.skipped)
    .map(seriesDate => ({
      seriesDate,
      date:       ov[seriesDate]?.date ?? seriesDate,
      amount:     ov[seriesDate]?.amount ?? item.amount,
      note:       ov[seriesDate]?.note ?? null,
      overridden: !!ov[seriesDate],
    }))
    .filter(c => c.date > todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
  return candidates[0] ?? null
}

// Store (or clear) the one-time override for one occurrence, then run the
// engine so an override whose chosen date has already arrived records at once
// (D4: intentional date choice = no second confirmation, regardless of mode).
export function applyOccurrenceOverride(itemId, seriesDate, { date, amount, note, skipped } = {}) {
  const items = load(KEY_ITEMS)
  const item = items.find(i => i.id === itemId)
  if (!item) return

  const clean = {}
  if (skipped) {
    clean.skipped = true
  } else {
    if (date && date !== seriesDate) clean.date = date
    if (amount != null && Number(amount) !== Number(item.amount)) clean.amount = Number(amount)
    if (note != null && note.trim() !== '') clean.note = note.trim()
  }

  const overrides = { ...(item.overrides ?? {}) }
  if (Object.keys(clean).length === 0) delete overrides[seriesDate]   // no-op edit clears any prior override
  else overrides[seriesDate] = clean
  save(KEY_ITEMS, items.map(i => i.id === itemId ? { ...i, overrides, updatedAt: new Date().toISOString() } : i))

  checkAndGeneratePending()
}

// Pending occurrences whose due date has arrived, enriched with their (active)
// item, oldest first — the "waiting for confirmation" list. Shared by the
// Bills & Income pending section and the Dashboard upcoming card (Phase 55c).
export function getDuePendingOccurrences() {
  const items = load(KEY_ITEMS).filter(i => i.isActive)
  const todayStr = localDateStr()
  return load(KEY_PENDING)
    .filter(p => p.status === 'pending' && p.dueDate <= todayStr)
    .map(p => ({ ...p, item: items.find(i => i.id === p.plannedItemId) }))
    .filter(p => p.item)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
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

    // Phase 55d: overrides shine through — a moved/adjusted occurrence shows its
    // effective date and amount; a skipped one is passed over.
    const next = getNextEffectiveOccurrence(item)
    if (next && next.date > todayStr) {
      occurrences.push({ date: next.date, item, seriesDate: next.seriesDate, amount: next.amount, overridden: next.overridden })
    }
  }

  return occurrences.sort((a, b) => a.date.localeCompare(b.date))
}

// ── Recurring engine (called on app open) ────────────────────────────────────

export function checkAndGeneratePending() {
  const todayStr = localDateStr()
  const items    = load(KEY_ITEMS).filter(i => i.isActive)
  const pending  = load(KEY_PENDING)

  // A set of (plannedItemId, series date) pairs already handled. Occurrences
  // carry `seriesDate` (the original schedule date — the dedupe key) since
  // Phase 55d; older records fall back to their dueDate.
  const handled = new Set(pending.map(p => `${p.plannedItemId}__${p.seriesDate ?? p.dueDate}`))

  const newPending = []
  const newPendingForConfirm = [] // occurrences needing immediate transaction creation
  const consumedOverrides = {}    // itemId → [seriesDate] — overrides consumed this run

  for (const item of items) {
    const ov = (item.frequency !== 'one-time' && item.overrides) || {}
    // Scan the raw series far enough to catch overrides that PULL a future
    // occurrence earlier (its original date may lie beyond today).
    const horizon = Object.keys(ov).reduce((m, k) => (k > m ? k : m), todayStr)
    // Phase 55a: `generatedFrom` (stamped by the edit form) suppresses every
    // series date before it — edits never backfill. A date ON it still fires.
    const seriesDates = getDueDates(item, horizon)
      .filter(d => !item.generatedFrom || d >= item.generatedFrom)

    for (const seriesDate of seriesDates) {
      const key = `${item.id}__${seriesDate}`
      if (handled.has(key)) continue

      const o = ov[seriesDate]

      // Phase 55d: a skipped occurrence is recorded (so it never re-fires) but
      // creates no transaction; the series continues unchanged.
      if (o?.skipped) {
        newPending.push({
          id: `occ_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          plannedItemId: item.id, seriesDate, dueDate: seriesDate,
          plannedAmount: item.amount, actualAmount: null,
          status: 'skipped', confirmedAt: null, transactionId: null,
          updatedAt: new Date().toISOString(),
        })
        ;(consumedOverrides[item.id] ??= []).push(seriesDate)
        continue
      }

      const effDate   = o?.date ?? seriesDate
      const effAmount = o?.amount ?? item.amount
      const effNote   = o?.note ?? item.name
      if (effDate > todayStr) continue   // not due yet (possibly pushed later)

      // D4 (locked 2026-07-08): an override with an explicitly chosen date that
      // has arrived records immediately in BOTH modes — the user picked the
      // date intentionally, no second confirmation. Otherwise the item's mode rules.
      const immediate = item.applicationMode === 'auto-apply' || (o?.date != null)

      const occ = {
        id:            `occ_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        plannedItemId: item.id,
        seriesDate,
        dueDate:       effDate,
        plannedAmount: effAmount,
        actualAmount:  null,
        status:        immediate ? 'confirmed' : 'pending',
        confirmedAt:   immediate ? new Date().toISOString() : null,
        transactionId: null,
        updatedAt:     new Date().toISOString(),
      }

      if (o) (consumedOverrides[item.id] ??= []).push(seriesDate)

      if (immediate) {
        newPendingForConfirm.push({ occ, item, date: effDate, amount: effAmount, note: effNote })
      } else {
        newPending.push(occ)
      }
    }
  }

  // Create transactions for immediately-recorded occurrences
  for (const { occ, item, date, amount, note } of newPendingForConfirm) {
    const tx = createTransaction({
      type:        item.type,
      accountId:   item.accountId,
      amount,
      currency:    item.currency,
      categoryId:  item.categoryId ?? null,
      envelopeId:  item.envelopeId ?? null,
      payeeName:   item.payee ?? '',
      note,
      date,
      isPlanned:   true,
      ...(item.countInNextPeriod ? { periodShift: 'next' } : {}),   // Phase 55f
    })
    newPending.push({ ...occ, transactionId: tx.id })
  }

  if (newPending.length > 0) {
    save(KEY_PENDING, [...pending, ...newPending])
  }

  // Consumed overrides are pruned from their items (one-shot by design).
  if (Object.keys(consumedOverrides).length > 0) {
    save(KEY_ITEMS, load(KEY_ITEMS).map(i => {
      const used = consumedOverrides[i.id]
      if (!used) return i
      const overrides = { ...(i.overrides ?? {}) }
      for (const k of used) delete overrides[k]
      return { ...i, overrides, updatedAt: new Date().toISOString() }
    }))
  }
}
