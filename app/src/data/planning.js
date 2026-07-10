import appStorage from '../utils/appStorage'
import { recordDeletion } from './syncMeta'
import { convertAmount } from '../utils/frequency'
import { round2 } from '../utils/format'
import { getActivePlanId, setActivePlanId } from './settings'

const KEY_INCOMES  = 'rmoney_planned_incomes'
const KEY_EXPENSES = 'rmoney_planned_expenses'
const KEY_PLANS    = 'rmoney_plans'

function load(key) {
  try { return JSON.parse(appStorage.getItem(key)) ?? [] } catch { return [] }
}

function save(key, data) {
  appStorage.setItem(key, JSON.stringify(data))
}

function generateId() { return crypto.randomUUID() }

// ─── Migration ────────────────────────────────────────────────────────────────
// One-time cleanup for SPEC-009 fix: planned incomes are now scratchpad-only,
// so any stored `linkedScheduledTransferId` on an income record is obsolete.
// Also clear any expense link pointing at a scheduled transfer that was just
// removed (pass the removed ids from cleanupSelfScheduledTransfers).
export function cleanupPlanningAfterSelfTransferRemoval(removedTransferIds = []) {
  const removed = new Set(removedTransferIds)

  const incomes = load(KEY_INCOMES)
  let incomesChanged = false
  const cleanedIncomes = incomes.map(i => {
    if (!('linkedScheduledTransferId' in i)) return i
    incomesChanged = true
    const { linkedScheduledTransferId, ...rest } = i  // eslint-disable-line no-unused-vars
    return rest
  })
  if (incomesChanged) save(KEY_INCOMES, cleanedIncomes)

  if (removed.size > 0) {
    const expenses = load(KEY_EXPENSES)
    let expensesChanged = false
    const cleanedExpenses = expenses.map(e => {
      if (e.linkedScheduledTransferId && removed.has(e.linkedScheduledTransferId)) {
        expensesChanged = true
        return { ...e, linkedScheduledTransferId: null }
      }
      return e
    })
    if (expensesChanged) save(KEY_EXPENSES, cleanedExpenses)
  }
}

// ─── Plans (SPEC-009, Phase 65 — multiple named envelope plans) ──────────────
// Plan record: { id, name, createdAt, updatedAt }. Planned incomes/expenses
// carry a `planId`. Exactly ONE plan is active (settings.activePlanId — synced,
// decision P1): only it shows sync indicators and may Apply; the others are
// freely editable drafts. `linkedScheduledTransferId` is a plain pointer —
// several plans may reference the same live rule (duplicates keep the links),
// but only the active plan acts on it. Deleting a plan therefore NEVER touches
// scheduled transfers (and the active plan cannot be deleted at all).

export function getPlans() {
  return load(KEY_PLANS)
}

// Boot migration (idempotent, wired in main.jsx + after a backup import):
// guarantees ≥1 plan exists, stamps `planId` on legacy items, and heals a
// missing/stale activePlanId.
export function ensureDefaultPlan() {
  let plans = load(KEY_PLANS)
  if (plans.length === 0) {
    plans = [{ id: generateId(), name: 'Plan 1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
    save(KEY_PLANS, plans)
  }
  const first = plans[0]
  for (const key of [KEY_INCOMES, KEY_EXPENSES]) {
    const items = load(key)
    if (items.some(i => !i.planId)) {
      save(key, items.map(i => i.planId ? i : { ...i, planId: first.id, updatedAt: new Date().toISOString() }))
    }
  }
  if (!plans.some(p => p.id === getActivePlanId())) setActivePlanId(first.id)
  return first
}

export function createPlan(name) {
  const plans = load(KEY_PLANS)
  const plan = { id: generateId(), name: name?.trim() || `Plan ${plans.length + 1}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  save(KEY_PLANS, [...plans, plan])
  return plan
}

export function renamePlan(id, name) {
  if (!name?.trim()) return
  save(KEY_PLANS, load(KEY_PLANS).map(p => p.id === id ? { ...p, name: name.trim(), updatedAt: new Date().toISOString() } : p))
}

// Deep-copies a plan: fresh ids for the plan and every item, expense tree
// parentId links remapped onto the new ids. `linkedScheduledTransferId`
// pointers are KEPT — the copy references the same live rules, and whichever
// plan is active acts on them (P1).
export function duplicatePlan(id, name) {
  const source = load(KEY_PLANS).find(p => p.id === id)
  if (!source) return null
  const plan = createPlan(name ?? `${source.name} (copy)`)

  const incomes = load(KEY_INCOMES)
  const copiedIncomes = incomes.filter(i => i.planId === id).map(i => ({
    ...i, id: generateId(), planId: plan.id,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }))
  save(KEY_INCOMES, [...incomes, ...copiedIncomes])

  const expenses = load(KEY_EXPENSES)
  const sourceExpenses = expenses.filter(e => e.planId === id)
  const idMap = new Map(sourceExpenses.map(e => [e.id, generateId()]))
  const copiedExpenses = sourceExpenses.map(e => ({
    ...e, id: idMap.get(e.id), planId: plan.id,
    parentId: e.parentId ? (idMap.get(e.parentId) ?? null) : null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }))
  save(KEY_EXPENSES, [...expenses, ...copiedExpenses])
  return plan
}

// Deletes a DRAFT plan and its items (with tombstones). Refuses the active
// plan — switch first; this also guarantees at least one plan always remains.
// Never touches scheduled transfers (only the active plan owns live rules).
export function deletePlan(id) {
  if (id === getActivePlanId()) return false
  const plans = load(KEY_PLANS)
  if (!plans.some(p => p.id === id)) return false

  for (const key of [KEY_INCOMES, KEY_EXPENSES]) {
    const items = load(key)
    const doomed = items.filter(i => i.planId === id)
    if (doomed.length > 0) {
      save(key, items.filter(i => i.planId !== id))
      for (const i of doomed) recordDeletion(key, i.id)
    }
  }
  save(KEY_PLANS, plans.filter(p => p.id !== id))
  recordDeletion(KEY_PLANS, id)
  return true
}

// Clears every expense's pointer at a deleted scheduled transfer — across ALL
// plans (drafts may hold copies of the same link). (Phase 65)
export function clearTransferLinks(transferId) {
  const expenses = load(KEY_EXPENSES)
  if (!expenses.some(e => e.linkedScheduledTransferId === transferId)) return
  save(KEY_EXPENSES, expenses.map(e =>
    e.linkedScheduledTransferId === transferId
      ? { ...e, linkedScheduledTransferId: null, updatedAt: new Date().toISOString() }
      : e
  ))
}

// Settings → Storage card figures (SPEC-026 convention: UTF-8 bytes via Blob).
export function getPlanningStorageSummary() {
  const plans = load(KEY_PLANS), incomes = load(KEY_INCOMES), expenses = load(KEY_EXPENSES)
  const bytes = [plans, incomes, expenses].reduce((s, v) => s + new Blob([JSON.stringify(v)]).size, 0)
  return { planCount: plans.length, incomeCount: incomes.length, expenseCount: expenses.length, bytes }
}

// Storage-tab bulk clean (SPEC-026 convention): removes every plan and planned
// item (with tombstones), then recreates the default plan so the Planning
// screen never faces an empty registry.
export function deleteAllPlanningData() {
  for (const key of [KEY_INCOMES, KEY_EXPENSES, KEY_PLANS]) {
    for (const item of load(key)) recordDeletion(key, item.id)
    appStorage.removeItem(key)
  }
  setActivePlanId(null)
  ensureDefaultPlan()
}

// ─── Planned incomes ──────────────────────────────────────────────────────────

// Pass a planId to scope to one plan (Phase 65); omit for all plans.
export function getPlannedIncomes(planId) {
  const items = load(KEY_INCOMES)
  return planId ? items.filter(i => i.planId === planId) : items
}

export function createPlannedIncome({ name, amount, currency, frequency, dayOfExecution, startDate, endDate, date, envelopeId, planId }) {
  const items = load(KEY_INCOMES)
  const isOneTime = frequency === 'one-time'
  const item = {
    id: generateId(),
    planId: planId ?? getActivePlanId(),
    name,
    amount: Number(amount),
    currency,
    frequency,
    dayOfExecution:         isOneTime ? null : Number(dayOfExecution),
    startDate:              isOneTime ? null : (startDate ?? null),
    endDate:                isOneTime ? null : (endDate ?? null),
    date:                   isOneTime ? (date ?? null) : null,
    envelopeId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save(KEY_INCOMES, [...items, item])
  return item
}

export function updatePlannedIncome(id, fields) {
  save(KEY_INCOMES, load(KEY_INCOMES).map(i => {
    if (i.id !== id) return i
    const merged = { ...i, ...fields, updatedAt: new Date().toISOString() }
    // Planned incomes are scratchpad-only — strip any legacy link field.
    delete merged.linkedScheduledTransferId
    return merged
  }))
}

export function deletePlannedIncome(id) {
  save(KEY_INCOMES, load(KEY_INCOMES).filter(i => i.id !== id))
  recordDeletion(KEY_INCOMES, id)
}

// ─── Planned expenses ─────────────────────────────────────────────────────────

// Pass a planId to scope to one plan (Phase 65); omit for all plans.
export function getPlannedExpenses(planId) {
  const items = load(KEY_EXPENSES)
  return planId ? items.filter(e => e.planId === planId) : items
}

export function createPlannedExpense({ name, parentId, envelopeId, sourceEnvelopeId, currency, amount, amountBasis, dayOfExecution, transferFrequency, planId }) {
  const items = load(KEY_EXPENSES)
  const item = {
    id: generateId(),
    planId: planId ?? getActivePlanId(),
    name,
    parentId:              parentId ?? null,
    envelopeId:            envelopeId ?? null,
    sourceEnvelopeId:      sourceEnvelopeId ?? null,
    currency:              currency ?? null,
    amountBasis:           amountBasis ?? 'monthly',
    amount:                amount != null ? Number(amount) : null,
    // Persisted since Phase 61f — previously the form's day was silently
    // dropped on create (it only survived edits, via the update spread).
    dayOfExecution:        dayOfExecution != null ? Number(dayOfExecution) : null,
    // The occurrence of the scheduled transfer "Apply" generates (Phase 61f).
    // Absent/null = monthly (legacy records and parents).
    transferFrequency:     transferFrequency ?? null,
    linkedScheduledTransferId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save(KEY_EXPENSES, [...items, item])
  return item
}

export function updatePlannedExpense(id, fields) {
  save(KEY_EXPENSES, load(KEY_EXPENSES).map(i => i.id === id ? { ...i, ...fields, updatedAt: new Date().toISOString() } : i))
}

export function deletePlannedExpense(id) {
  save(KEY_EXPENSES, load(KEY_EXPENSES).filter(i => i.id !== id))
  recordDeletion(KEY_EXPENSES, id)
}

// Returns all descendants (children, grandchildren, …) of a given expense item.
export function getExpenseDescendants(id, all) {
  const children = all.filter(e => e.parentId === id)
  return children.flatMap(child => [child, ...getExpenseDescendants(child.id, all)])
}

// Deletes an expense item and every one of its descendants.
export function deletePlannedExpenseTree(id) {
  const all = load(KEY_EXPENSES)
  const toDelete = new Set([id, ...getExpenseDescendants(id, all).map(e => e.id)])
  save(KEY_EXPENSES, all.filter(e => !toDelete.has(e.id)))
  for (const e of all.filter(e => toDelete.has(e.id))) {
    recordDeletion(KEY_EXPENSES, e.id)
  }
}

// Convert a leaf item into a parent: clear its envelope/amount fields.
// Call this AFTER the child item has already been created.
export function convertLeafToParent(id) {
  save(KEY_EXPENSES, load(KEY_EXPENSES).map(i =>
    i.id === id
      ? { ...i, envelopeId: null, sourceEnvelopeId: null, currency: null, amount: null, amountBasis: null, dayOfExecution: null, transferFrequency: null, linkedScheduledTransferId: null, updatedAt: new Date().toISOString() }
      : i
  ))
}

// ─── Apply / sync helpers (pure — unit-tested) ────────────────────────────────

// The scheduled-transfer fields a planned expense leaf prescribes (Phase 61f):
// the transfer fires at the leaf's chosen occurrence (`transferFrequency`,
// default monthly) with the amount converted to that same basis — so a yearly
// occurrence transfers the yearly figure once a year, not a monthly slice —
// rounded to cents before it is persisted (Phase 54a), between the leaf's
// source and destination envelopes (Phase 61g — apply also syncs envelope
// changes, so editing the target envelope propagates to the rule).
export function plannedTransferFields(expense) {
  const frequency = expense.transferFrequency || 'monthly'
  return {
    fromEnvelopeId: expense.sourceEnvelopeId,
    toEnvelopeId:   expense.envelopeId,
    frequency,
    amount:         round2(convertAmount(expense.amount, expense.amountBasis, frequency)),
    dayOfExecution: expense.dayOfExecution ?? 1,
  }
}

// Sync status of an expense leaf vs its linked scheduled transfer:
// 'not-applied' | 'in-sync' | 'out-of-sync'. Out of sync when ANY prescribed
// field differs: the envelopes (Phase 61g — an edited target/source envelope
// must be applicable), the frequency (Phase 61f), the day of execution, or
// the monthly-equivalent amount at cent precision (Phase 54a — both sides
// rounded so an unrounded planned figure never reads as out-of-sync).
export function expenseSyncStatus(expense, scheduledTransfers) {
  if (!expense.linkedScheduledTransferId) return 'not-applied'
  const t = scheduledTransfers.find(s => s.id === expense.linkedScheduledTransferId)
  if (!t) return 'not-applied'
  const wanted = plannedTransferFields(expense)
  if (wanted.toEnvelopeId !== t.toEnvelopeId)     return 'out-of-sync'
  if (wanted.fromEnvelopeId !== t.fromEnvelopeId) return 'out-of-sync'
  if (wanted.frequency !== t.frequency)           return 'out-of-sync'
  if (wanted.dayOfExecution !== (t.dayOfExecution ?? 1)) return 'out-of-sync'
  const planned = round2(convertAmount(expense.amount, expense.amountBasis, 'monthly'))
  const actual  = round2(convertAmount(t.amount, t.frequency, 'monthly'))
  return Math.abs(planned - actual) < 0.005 ? 'in-sync' : 'out-of-sync'
}

// Fields that revert a leaf to mirror its linked transfer (the reset action):
// adopt the transfer's frequency as both the occurrence and the amount basis.
// A weekly/bi-weekly transfer (possible by editing the rule on the
// Scheduled-transfers page) falls back to its monthly equivalent — the
// planning columns are yearly/quarterly/monthly only.
export function resetFieldsFromTransfer(t) {
  if (t.frequency === 'monthly' || t.frequency === 'quarterly' || t.frequency === 'yearly') {
    return { amount: t.amount, amountBasis: t.frequency, transferFrequency: t.frequency }
  }
  return {
    amount:            round2(convertAmount(t.amount, t.frequency, 'monthly')),
    amountBasis:       'monthly',
    transferFrequency: 'monthly',
  }
}
