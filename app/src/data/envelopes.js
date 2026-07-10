import appStorage from '../utils/appStorage'
import { localDateStr } from '../utils/dates'
import { monthlyEquivalent, FREQUENCIES } from '../utils/frequency'
import { round2 } from '../utils/format'
import { getAccountBalance } from './transactions'
import { recordDeletion } from './syncMeta'

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
// which add with `+` — see migrateTransferAmounts below). Also rounds to 2
// decimals (Phase 54a): no write path may persist sub-cent precision — computed
// amounts like a yearly target ÷ 12 (4.305) made stored sums disagree with
// their per-row rounded display.
function coerceAmount(fields) {
  if (fields && fields.amount !== undefined) {
    return { ...fields, amount: round2(fields.amount) }
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
  // Orphaned subtrees (Phase 66f): an envelope whose parent is NOT in the
  // passed set — e.g. an ACTIVE envelope under an ARCHIVED ancestor that the
  // caller filtered out — must still be pickable. Append each such subtree
  // as its own root; previously it silently vanished from every dropdown.
  const ids = new Set(envelopes.map(e => e.id))
  const orphanRoots = sortAlpha(envelopes.filter(e => e.parentId && !ids.has(e.parentId)))
  for (const o of orphanRoots) {
    result.push({ ...o, depth: 0 })
    walk(o.id, 1)
  }
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
      updatedAt: new Date().toISOString(),
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
      updatedAt: new Date().toISOString(),
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
    updatedAt: new Date().toISOString(),
  }
  save(KEY_ENVELOPES, [...envelopes, envelope])
  return envelope
}

export function updateEnvelope(id, fields) {
  const envelopes = load(KEY_ENVELOPES)
  save(KEY_ENVELOPES, envelopes.map(e => e.id === id ? { ...e, ...fields, updatedAt: new Date().toISOString() } : e))
}

export function archiveEnvelope(id, { newDefaultIncomeId, newDefaultExpenseId } = {}) {
  const envelopes = load(KEY_ENVELOPES)
  const target = envelopes.find(e => e.id === id)
  const now = new Date().toISOString()

  let updated = envelopes.map(e => {
    if (e.id === id) return { ...e, isArchived: true, updatedAt: now }
    // Reassign defaults if the archived envelope was a default
    if (target?.isDefaultIncome && e.id === newDefaultIncomeId)
      return { ...e, isDefaultIncome: true, updatedAt: now }
    if (target?.isDefaultExpense && e.id === newDefaultExpenseId)
      return { ...e, isDefaultExpense: true, updatedAt: now }
    return e
  })

  // Clear old default flags from archived envelope
  updated = updated.map(e =>
    e.id === id ? { ...e, isDefaultIncome: false, isDefaultExpense: false, updatedAt: now } : e
  )

  save(KEY_ENVELOPES, updated)
}

export function deleteEnvelope(id) {
  const envelopes = load(KEY_ENVELOPES)
  if (envelopes.find(e => e.id === id)?.isBuiltIn) return  // built-ins cannot be deleted
  const toDelete = new Set([id, ...getDescendants(id, envelopes).map(e => e.id)])
  save(KEY_ENVELOPES, envelopes.filter(e => !toDelete.has(e.id)))
  for (const e of envelopes.filter(e => toDelete.has(e.id))) {
    recordDeletion(KEY_ENVELOPES, e.id)
  }
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

  // Boundary account-transfers (SPEC-038, Phase 56b): a transfer that crosses
  // the tracked/untracked line posts to a chosen envelope — money leaving the
  // tracked world is an envelope expense, money entering is envelope income.
  // The direction is STORED on the transaction (`envelopeFlow`), so later
  // toggling an account's flag never rewrites history.
  const flowIn = txs
    .filter(t => t.type === 'transfer' && t.envelopeId === envelopeId && t.envelopeFlow === 'income')
    .reduce((s, t) => s + Number(t.destinationAmount), 0)
  const flowOut = txs
    .filter(t => t.type === 'transfer' && t.envelopeId === envelopeId && t.envelopeFlow === 'expense')
    .reduce((s, t) => s + Number(t.sourceAmount), 0)

  // Account starting balances — these are "initial money" that lives in the
  // default income envelope until the user distributes it. Untracked accounts
  // (SPEC-038, Phase 56c) are excluded — their money is outside the envelopes.
  let startingBalances = 0
  if (envelope?.isDefaultIncome) {
    const KEY_ACCOUNTS = 'rmoney_accounts'
    const accounts = (() => { try { return JSON.parse(appStorage.getItem(KEY_ACCOUNTS)) ?? [] } catch { return [] } })()
    startingBalances = accounts
      .filter(a => a.countedInEnvelopes !== false)
      .reduce((sum, a) => sum + Number(a.startingBalance), 0)
  }

  return (transferIn + txIn + flowIn + startingBalances) - (transferOut + txOut + flowOut)
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
  // Untracked accounts' starting money is outside the envelopes (SPEC-038).
  for (const a of accounts.filter(a => !a.isArchived && a.countedInEnvelopes !== false)) {
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
    } else if (tx.type === 'transfer' && tx.envelopeFlow === 'income') {
      // Boundary transfer INTO the tracked world (SPEC-038, Phase 56b)
      const cur = tx.destinationCurrency || tx.currency || 'EUR'
      result[cur] = (result[cur] ?? 0) + Number(tx.destinationAmount)
    } else if (tx.type === 'transfer' && tx.envelopeFlow === 'expense') {
      // Boundary transfer OUT of the tracked world
      const cur = tx.sourceCurrency || tx.currency || 'EUR'
      result[cur] = (result[cur] ?? 0) - Number(tx.sourceAmount)
    }
  }
  return result
}

// Unallocated reconciliation figure (SPEC-038, Phase 56e): per currency, the
// current balances of TRACKED active accounts minus the envelope totals. Zero
// when every tracked unit of money sits in an envelope; a non-zero value
// usually reveals boundary crossings recorded before the feature existed.
export function getUnallocatedByCurrency() {
  const KEY_ACCOUNTS = 'rmoney_accounts'
  const accounts = (() => { try { return JSON.parse(appStorage.getItem(KEY_ACCOUNTS)) ?? [] } catch { return [] } })()
  const tracked = accounts.filter(a => !a.isArchived && a.countedInEnvelopes !== false)

  const result = {}
  for (const a of tracked) {
    const cur = a.currency || 'EUR'
    result[cur] = (result[cur] ?? 0) + getAccountBalance(a.id, a.startingBalance)
  }
  const env = getEnvelopesTotalByCurrency()
  for (const [cur, total] of Object.entries(env)) {
    result[cur] = (result[cur] ?? 0) - total
  }
  for (const cur of Object.keys(result)) result[cur] = round2(result[cur])
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
    amount: round2(amount),   // never persist sub-cent precision (Phase 54a)
    date: date ?? localDateStr(),
    note: note ?? '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save(KEY_TRANSFERS, [...transfers, transfer])
  return transfer
}

export function updateEnvelopeTransfer(id, fields) {
  const patch = coerceAmount(fields)
  const transfers = load(KEY_TRANSFERS)
  save(KEY_TRANSFERS, transfers.map(t => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t))
}

export function deleteEnvelopeTransfer(id) {
  const transfers = load(KEY_TRANSFERS)
  save(KEY_TRANSFERS, transfers.filter(t => t.id !== id))
  recordDeletion(KEY_TRANSFERS, id)
}

// ─── Scheduled transfers ─────────────────────────────────────────────────────

export function getScheduledTransfers() {
  return load(KEY_SCHEDULED)
}

export function createScheduledTransfer({ fromEnvelopeId, toEnvelopeId, amount, frequency, dayOfExecution, startDate, note }) {
  const scheduled = load(KEY_SCHEDULED)
  const item = {
    id: generateId(),
    fromEnvelopeId,
    toEnvelopeId,
    amount: round2(amount),   // never persist sub-cent precision (Phase 54a)
    frequency,
    dayOfExecution: Number(dayOfExecution),
    startDate: startDate || null,   // optional anchor/gate (Phase 53f); null = legacy createdAt anchoring
    note: note ?? '',               // was silently dropped on create (edits kept it) — fixed in Phase 53f
    isActive: true,
    lastExecutedDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

// The cadence anchor: the rule's explicit startDate (local y-m-d, Phase 53f)
// when present, else its creation moment (legacy behaviour). Parsed with the
// local Date constructor — never new Date('YYYY-MM-DD'), which is a UTC parse.
function scheduleAnchor(s) {
  if (s.startDate) {
    const [y, m, d] = s.startDate.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return atMidnight(new Date(s.createdAt))
}

// Does a scheduled transfer fall due on `today`?
//   weekly    → matching weekday
//   biweekly  → matching weekday AND an even number of weeks from the anchor
//               (first matching weekday on/after createdAt)
//   monthly   → matching day-of-month (1–28, so no month-length clamping needed)
//   quarterly → matching day-of-month, in a month 0/3/6/9 from the anchor month
//   yearly    → matching day-of-month, in the anchor month
// Bi-weekly/quarterly/yearly anchor on the rule's optional `startDate`, else
// `createdAt` (Phase 53f); monthly/weekly need no anchor. An explicit startDate
// also gates EVERY frequency: nothing fires before it.
function isScheduledTransferDueToday(s, today) {
  // Nothing fires before an explicit start date (Phase 53f) — enables
  // "starts next month" rules and user control over the cadence anchor.
  if (s.startDate && localDateStr(today) < s.startDate) return false
  const dow = today.getDay()
  const dom = today.getDate()
  switch (s.frequency) {
    case 'weekly':
      return dow === s.dayOfExecution
    case 'biweekly': {
      if (dow !== s.dayOfExecution) return false
      const base = scheduleAnchor(s)
      const daysUntil = (s.dayOfExecution - base.getDay() + 7) % 7
      const anchor = new Date(base)
      anchor.setDate(anchor.getDate() + daysUntil)
      const diffDays = Math.round((atMidnight(today) - anchor) / 86400000)
      return diffDays >= 0 && diffDays % 14 === 0
    }
    case 'monthly':
      return dom === s.dayOfExecution
    case 'quarterly':
      return dom === s.dayOfExecution && monthsBetween(scheduleAnchor(s), today) % 3 === 0
    case 'yearly':
      return dom === s.dayOfExecution && monthsBetween(scheduleAnchor(s), today) % 12 === 0
    default:
      return false
  }
}

// ── Occurrence overrides (Phase 64a — mirrors the Bills & Income model, 55d) ──
// A rule may carry `overrides: { [seriesDate]: { date?, amount?, skipped? } }`
// — a one-shot change to the single occurrence whose ORIGINAL schedule date is
// the key. The series itself is untouched; the engine consumes an override when
// its occurrence fires or its skip day passes. An overridden occurrence fires
// when its chosen date has arrived OR passed (D4: the user picked the date
// intentionally — catch-up on the next engine run, dated as chosen).

// The next occurrence the user will actually see, override-aware:
// skipped ones are passed over, date/amount overrides shine through.
// Returns { date, seriesDate, amount, overridden } or null.
export function nextScheduledOccurrenceInfo(s, fromDate = new Date()) {
  const fromStr = localDateStr(atMidnight(fromDate))
  const ov = s.overrides ?? {}
  const candidates = []
  for (const [seriesDate, o] of Object.entries(ov)) {
    if (o.skipped) continue
    const eff = o.date ?? seriesDate
    if (eff >= fromStr) {
      candidates.push({ date: eff, seriesDate, amount: o.amount ?? s.amount, overridden: true })
    }
  }
  // First NATURAL date without an override of its own (moved/adjusted dates are
  // all covered by the candidates above; skipped ones are scanned past).
  const start = atMidnight(fromDate)
  for (let i = 0; i < 800; i++) {   // 800 days > any single-frequency gap (yearly)
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    if (!isScheduledTransferDueToday(s, d)) continue
    const ds = localDateStr(d)
    if (ov[ds]) continue
    candidates.push({ date: ds, seriesDate: ds, amount: s.amount, overridden: false })
    break
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date))
  return candidates[0] ?? null
}

// The next date (local YYYY-MM-DD) on or after `fromDate` on which a scheduled
// transfer fires, across every frequency — override-aware since Phase 64a, so
// what the lists show as "next" always matches what actually fires. (Phase 49b)
export function nextScheduledOccurrence(s, fromDate = new Date()) {
  return nextScheduledOccurrenceInfo(s, fromDate)?.date ?? null
}

// Store (or clear — empty patch) the one-time override for one occurrence, then
// run the engine so an override whose chosen date has already arrived records
// at once (D4: intentional date choice = no waiting for the next app open).
export function applyScheduledTransferOverride(id, seriesDate, { date, amount, skipped } = {}) {
  const scheduled = load(KEY_SCHEDULED)
  const s = scheduled.find(x => x.id === id)
  if (!s) return

  const clean = {}
  if (skipped) {
    clean.skipped = true
  } else {
    if (date && date !== seriesDate) clean.date = date
    if (amount != null && Number(amount) !== Number(s.amount)) clean.amount = Number(amount)
  }

  const overrides = { ...(s.overrides ?? {}) }
  if (Object.keys(clean).length === 0) delete overrides[seriesDate]   // no-op edit clears any prior override
  else overrides[seriesDate] = clean
  save(KEY_SCHEDULED, scheduled.map(x =>
    x.id === id ? { ...x, overrides, updatedAt: new Date().toISOString() } : x
  ))

  runDueScheduledTransfers()
}

// The occurrence (if any) a rule should handle today, override-aware:
//   { seriesDate, date, amount, overridden } → fire it
//   { seriesDate, skipped: true }            → consume the skip silently
//   null                                     → nothing to do today
function dueScheduledOccurrence(s, today) {
  const todayStr = localDateStr(today)
  const ov = s.overrides ?? {}

  // Overridden occurrences fire when their chosen date has arrived or passed
  // (D4 catch-up) — earliest first; one per rule per day (lastExecutedDate guard).
  const dueOverridden = Object.entries(ov)
    .filter(([, o]) => !o.skipped)
    .map(([seriesDate, o]) => ({ seriesDate, date: o.date ?? seriesDate, amount: o.amount ?? s.amount, overridden: true }))
    .filter(c => c.date <= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (dueOverridden.length > 0) return dueOverridden[0]

  if (!isScheduledTransferDueToday(s, today)) return null
  const o = ov[todayStr]
  if (o?.skipped) return { seriesDate: todayStr, skipped: true }
  if (o?.date && o.date !== todayStr) return null   // pushed later — fires on its chosen date
  return { seriesDate: todayStr, date: todayStr, amount: s.amount, overridden: false }
}

// Summary of a set of scheduled transfers relative to an envelope family
// (the envelope + its descendants) — Phase 61b: net sum of the RAW amounts
// per frequency (a weekly 50 shows as Weekly +50, never silently converted),
// plus the approximate monthly average = yearly-equivalent total ÷ 12 (via
// `monthlyEquivalent`) for when frequencies are mixed. Transfers internal to
// the family move nothing across its boundary and are excluded, as are
// transfers not touching it. `envelopeIds` is a Set (or array) of ids.
export function scheduledTransfersSummary(scheduled, envelopeIds) {
  const ids = envelopeIds instanceof Set ? envelopeIds : new Set([].concat(envelopeIds))
  const netByFreq = new Map()
  let monthlyAvg = 0
  for (const s of scheduled) {
    const into  = ids.has(s.toEnvelopeId)
    const outOf = ids.has(s.fromEnvelopeId)
    if (into === outOf) continue  // internal to the family, or unrelated
    const freq = s.frequency || 'monthly'
    const sign = into ? 1 : -1
    netByFreq.set(freq, (netByFreq.get(freq) ?? 0) + sign * (Number(s.amount) || 0))
    monthlyAvg += sign * monthlyEquivalent(s.amount, freq)
  }
  const order = FREQUENCIES.map(f => f.value)
  const byFrequency = [...netByFreq.entries()]
    .map(([frequency, net]) => ({ frequency, net }))
    .sort((a, b) => order.indexOf(a.frequency) - order.indexOf(b.frequency))
  const allMonthly = byFrequency.every(g => g.frequency === 'monthly')
  return { byFrequency, monthlyAvg, allMonthly }
}

export function runDueScheduledTransfers() {
  const today = new Date()
  const todayStr = localDateStr(today)

  const scheduled = load(KEY_SCHEDULED)
  const transfers = load(KEY_TRANSFERS)
  const newTransfers = []
  let scheduledChanged = false   // overrides can be consumed without firing (skip)

  const updatedScheduled = scheduled.map(s => {
    if (!s.isActive) return s
    if (s.lastExecutedDate === todayStr) return s  // already ran today

    // Hygiene: a skip for a natural date that has already passed can never
    // apply (the engine never backfills natural dates) — prune it.
    let overrides = { ...(s.overrides ?? {}) }
    const stale = Object.keys(overrides).filter(sd => overrides[sd].skipped && sd < todayStr)
    if (stale.length > 0) {
      stale.forEach(sd => delete overrides[sd])
      scheduledChanged = true
      s = { ...s, overrides, updatedAt: new Date().toISOString() }
    }

    const occ = dueScheduledOccurrence(s, today)
    if (!occ) return s

    if (occ.skipped) {
      // Consume the skip: nothing fires, the series continues (Phase 64a).
      delete overrides[occ.seriesDate]
      scheduledChanged = true
      return { ...s, overrides, lastExecutedDate: todayStr, updatedAt: new Date().toISOString() }
    }

    newTransfers.push({
      id: generateId(),
      fromEnvelopeId: s.fromEnvelopeId,
      toEnvelopeId: s.toEnvelopeId,
      amount: occ.amount,
      date: occ.date,
      note: `Scheduled (${s.frequency})${occ.overridden ? ' — adjusted occurrence' : ''}`,
      isScheduled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    if (occ.overridden) {
      // Consume one-shot. A pulled-earlier occurrence leaves a skip on its
      // natural date so the series can never double-fire it (Phase 64a).
      if (occ.seriesDate > todayStr) overrides[occ.seriesDate] = { skipped: true }
      else delete overrides[occ.seriesDate]
      scheduledChanged = true
    }
    return { ...s, overrides, lastExecutedDate: todayStr, updatedAt: new Date().toISOString() }
  })

  if (newTransfers.length > 0 || scheduledChanged) {
    if (newTransfers.length > 0) save(KEY_TRANSFERS, [...transfers, ...newTransfers])
    save(KEY_SCHEDULED, updatedScheduled)
  }
}

export function updateScheduledTransfer(id, fields) {
  const patch = coerceAmount(fields)
  const scheduled = load(KEY_SCHEDULED)
  save(KEY_SCHEDULED, scheduled.map(s => s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s))
}

export function deleteScheduledTransfer(id) {
  const scheduled = load(KEY_SCHEDULED)
  save(KEY_SCHEDULED, scheduled.filter(s => s.id !== id))
  recordDeletion(KEY_SCHEDULED, id)
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

// ─── Migration: repair stored amounts (strings + sub-cent precision) ─────────
// Two historical write bugs left bad amounts in storage:
//  • Phase 43: the one-time-transfer *edit* form persisted `amount` as the raw
//    string from its <input> — balance sums then concatenated instead of adding.
//  • Phase 54a: Planning "apply" persisted unrounded computed amounts (a yearly
//    target ÷ 12 → 4.305), so stored sums disagreed with the per-row rounded
//    display (the "0,01 header vs 0,00 running balance" screenshot).
// Write paths now coerce AND round; this startup pass (idempotent) repairs
// already-stored data without the user re-saving each record. Only finite
// values are rewritten, so a malformed string is left untouched.
export function migrateTransferAmounts() {
  const repairList = (items) => {
    let changed = false
    const fixed = items.map(item => {
      const n = typeof item.amount === 'string' ? Number(item.amount) : item.amount
      if (!Number.isFinite(n)) return item
      const rounded = round2(n)
      if (rounded !== item.amount) { changed = true; return { ...item, amount: rounded } }
      return item
    })
    return { fixed, changed }
  }

  const transfers = repairList(load(KEY_TRANSFERS))
  if (transfers.changed) save(KEY_TRANSFERS, transfers.fixed)

  const scheduled = repairList(load(KEY_SCHEDULED))
  if (scheduled.changed) save(KEY_SCHEDULED, scheduled.fixed)
}
