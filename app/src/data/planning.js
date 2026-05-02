const KEY_INCOMES  = 'rmoney_planned_incomes'
const KEY_EXPENSES = 'rmoney_planned_expenses'

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? [] } catch { return [] }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data))
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

// ─── Planned incomes ──────────────────────────────────────────────────────────

export function getPlannedIncomes() {
  return load(KEY_INCOMES)
}

export function createPlannedIncome({ name, amount, currency, frequency, dayOfExecution, startDate, endDate, date, envelopeId }) {
  const items = load(KEY_INCOMES)
  const isOneTime = frequency === 'one-time'
  const item = {
    id: generateId(),
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
  }
  save(KEY_INCOMES, [...items, item])
  return item
}

export function updatePlannedIncome(id, fields) {
  save(KEY_INCOMES, load(KEY_INCOMES).map(i => {
    if (i.id !== id) return i
    const merged = { ...i, ...fields }
    // Planned incomes are scratchpad-only — strip any legacy link field.
    delete merged.linkedScheduledTransferId
    return merged
  }))
}

export function deletePlannedIncome(id) {
  save(KEY_INCOMES, load(KEY_INCOMES).filter(i => i.id !== id))
}

// ─── Planned expenses ─────────────────────────────────────────────────────────

export function getPlannedExpenses() {
  return load(KEY_EXPENSES)
}

export function createPlannedExpense({ name, parentId, envelopeId, sourceEnvelopeId, currency, amount, amountBasis }) {
  const items = load(KEY_EXPENSES)
  const item = {
    id: generateId(),
    name,
    parentId:              parentId ?? null,
    envelopeId:            envelopeId ?? null,
    sourceEnvelopeId:      sourceEnvelopeId ?? null,
    currency:              currency ?? null,
    amountBasis:           amountBasis ?? 'monthly',
    amount:                amount != null ? Number(amount) : null,
    linkedScheduledTransferId: null,
    createdAt: new Date().toISOString(),
  }
  save(KEY_EXPENSES, [...items, item])
  return item
}

export function updatePlannedExpense(id, fields) {
  save(KEY_EXPENSES, load(KEY_EXPENSES).map(i => i.id === id ? { ...i, ...fields } : i))
}

export function deletePlannedExpense(id) {
  save(KEY_EXPENSES, load(KEY_EXPENSES).filter(i => i.id !== id))
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
}

// Convert a leaf item into a parent: clear its envelope/amount fields.
// Call this AFTER the child item has already been created.
export function convertLeafToParent(id) {
  save(KEY_EXPENSES, load(KEY_EXPENSES).map(i =>
    i.id === id
      ? { ...i, envelopeId: null, sourceEnvelopeId: null, currency: null, amount: null, amountBasis: null, linkedScheduledTransferId: null }
      : i
  ))
}
