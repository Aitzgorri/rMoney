import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createPlannedExpense, getPlannedExpenses, createPlannedIncome, getPlannedIncomes, updatePlannedExpense,
  plannedTransferFields, expenseSyncStatus, resetFieldsFromTransfer,
  getPlans, ensureDefaultPlan, createPlan, renamePlan, duplicatePlan, deletePlan, clearTransferLinks,
} from './planning'
import { getActivePlanId, setActivePlanId } from './settings'
import { seedStorage, resetStorage, readStorage } from '../test/storage'

// Phase 61f — planned expenses prescribe the OCCURRENCE of the scheduled
// transfer "Apply" generates (monthly | quarterly | yearly, default monthly).
// Previously every applied transfer was hard-coded monthly.

describe('plannedTransferFields (Phase 61f — occurrence-aware apply)', () => {
  it('defaults to monthly with the monthly-basis amount (legacy records) and carries the envelopes', () => {
    const exp = { amount: 100, amountBasis: 'monthly', dayOfExecution: 5, sourceEnvelopeId: 'env-src', envelopeId: 'env-dst' }
    expect(plannedTransferFields(exp)).toEqual({
      fromEnvelopeId: 'env-src', toEnvelopeId: 'env-dst',
      frequency: 'monthly', amount: 100, dayOfExecution: 5,
    })
  })

  it('a yearly occurrence transfers the yearly figure once a year — not a monthly slice', () => {
    const exp = { amount: 600, amountBasis: 'yearly', transferFrequency: 'yearly', dayOfExecution: 15 }
    expect(plannedTransferFields(exp)).toEqual({ frequency: 'yearly', amount: 600, dayOfExecution: 15 })
  })

  it('converts across bases: monthly-entered amount applied quarterly ×3', () => {
    const exp = { amount: 100, amountBasis: 'monthly', transferFrequency: 'quarterly', dayOfExecution: 1 }
    expect(plannedTransferFields(exp)).toEqual({ frequency: 'quarterly', amount: 300, dayOfExecution: 1 })
  })

  it('rounds the converted amount to cents (Phase 54a) and defaults a missing day to 1', () => {
    const exp = { amount: 100, amountBasis: 'quarterly', transferFrequency: 'monthly' }
    expect(plannedTransferFields(exp)).toEqual({ frequency: 'monthly', amount: 33.33, dayOfExecution: 1 })
  })
})

describe('expenseSyncStatus (Phase 61f/61g — every prescribed field is compared)', () => {
  const linked = over => ({
    linkedScheduledTransferId: 't1', amount: 100, amountBasis: 'monthly',
    sourceEnvelopeId: 'env-src', envelopeId: 'env-dst', dayOfExecution: 5,
    ...over,
  })
  const transfer = over => ({
    id: 't1', amount: 100, frequency: 'monthly',
    fromEnvelopeId: 'env-src', toEnvelopeId: 'env-dst', dayOfExecution: 5,
    ...over,
  })

  it('not-applied without a link or when the linked transfer is gone', () => {
    expect(expenseSyncStatus({ amount: 100 }, [])).toBe('not-applied')
    expect(expenseSyncStatus(linked(), [])).toBe('not-applied')
  })

  it('in-sync when envelopes, frequency, day and amount all match', () => {
    expect(expenseSyncStatus(linked(), [transfer()])).toBe('in-sync')
  })

  it('out-of-sync on an amount difference', () => {
    expect(expenseSyncStatus(linked(), [transfer({ amount: 90 })])).toBe('out-of-sync')
  })

  it('out-of-sync when the TARGET envelope changed (61g regression — was never detected)', () => {
    expect(expenseSyncStatus(linked({ envelopeId: 'env-other' }), [transfer()])).toBe('out-of-sync')
  })

  it('out-of-sync when the SOURCE envelope changed', () => {
    expect(expenseSyncStatus(linked({ sourceEnvelopeId: 'env-other' }), [transfer()])).toBe('out-of-sync')
  })

  it('out-of-sync when only the day of execution changed', () => {
    expect(expenseSyncStatus(linked({ dayOfExecution: 20 }), [transfer()])).toBe('out-of-sync')
  })

  it('out-of-sync on a frequency mismatch even when the monthly equivalents match', () => {
    // Planned: quarterly occurrence of 300/quarter (= 100/month). Linked
    // transfer still fires monthly at 100 — equivalents equal, rule differs.
    const exp = linked({ amount: 300, amountBasis: 'quarterly', transferFrequency: 'quarterly' })
    expect(expenseSyncStatus(exp, [transfer()])).toBe('out-of-sync')
  })
})

describe('resetFieldsFromTransfer (Phase 61f)', () => {
  it('adopts the transfer frequency as occurrence AND amount basis', () => {
    expect(resetFieldsFromTransfer({ amount: 300, frequency: 'quarterly' }))
      .toEqual({ amount: 300, amountBasis: 'quarterly', transferFrequency: 'quarterly' })
  })

  it('falls back to the monthly equivalent for a weekly transfer (planning has no weekly basis)', () => {
    expect(resetFieldsFromTransfer({ amount: 50, frequency: 'weekly' }))
      .toEqual({ amount: 216.67, amountBasis: 'monthly', transferFrequency: 'monthly' })
  })
})

// Phase 65 — multiple named envelope plans (SPEC-009, decision P1): a plans
// registry, planId scoping on items, one ACTIVE plan (settings.activePlanId,
// synced), and drafts that never touch live scheduled transfers.
describe('plans registry (Phase 65a)', () => {
  beforeEach(() => seedStorage({}))
  afterEach(() => resetStorage())

  it('ensureDefaultPlan creates "Plan 1", stamps legacy items, sets it active — idempotently', () => {
    seedStorage({
      rmoney_planned_incomes:  [{ id: 'i1', name: 'Salary', amount: 1000 }],          // legacy: no planId
      rmoney_planned_expenses: [{ id: 'e1', name: 'Rent', amount: 500 }],
    })
    const plan = ensureDefaultPlan()
    expect(plan.name).toBe('Plan 1')
    expect(getPlans()).toHaveLength(1)
    expect(getPlannedIncomes(plan.id).map(i => i.id)).toEqual(['i1'])
    expect(getPlannedExpenses(plan.id).map(e => e.id)).toEqual(['e1'])
    expect(getActivePlanId()).toBe(plan.id)
    ensureDefaultPlan()                       // second run changes nothing
    expect(getPlans()).toHaveLength(1)
  })

  it('ensureDefaultPlan heals a stale active-plan id without creating a new plan', () => {
    const plan = ensureDefaultPlan()
    setActivePlanId('gone')
    ensureDefaultPlan()
    expect(getActivePlanId()).toBe(plan.id)
    expect(getPlans()).toHaveLength(1)
  })

  it('items are scoped by planId; create* defaults to the active plan', () => {
    const p1 = ensureDefaultPlan()
    const p2 = createPlan('Ambitious plan')
    createPlannedIncome({ name: 'Salary', amount: 1000, frequency: 'monthly', dayOfExecution: 1 })          // → active (p1)
    createPlannedExpense({ name: 'Rent', amount: 500, amountBasis: 'monthly', planId: p2.id })              // explicit p2
    expect(getPlannedIncomes(p1.id)).toHaveLength(1)
    expect(getPlannedIncomes(p2.id)).toHaveLength(0)
    expect(getPlannedExpenses(p2.id)).toHaveLength(1)
    expect(getPlannedExpenses()).toHaveLength(1)   // unscoped = all plans
    renamePlan(p2.id, 'Renamed')
    expect(getPlans().find(p => p.id === p2.id).name).toBe('Renamed')
  })

  it('duplicatePlan deep-copies the tree (remapped parentIds, fresh ids) and KEEPS transfer links', () => {
    const p1 = ensureDefaultPlan()
    const parent = createPlannedExpense({ name: 'Housing', planId: p1.id })
    const child  = createPlannedExpense({ name: 'Rent', parentId: parent.id, amount: 500, amountBasis: 'monthly', planId: p1.id })
    updatePlannedExpense(child.id, { linkedScheduledTransferId: 'rule-1' })   // simulate an applied leaf

    const copy = duplicatePlan(p1.id, 'Copy')
    const copied = getPlannedExpenses(copy.id)
    expect(copied).toHaveLength(2)
    const copiedParent = copied.find(e => e.name === 'Housing')
    const copiedChild  = copied.find(e => e.name === 'Rent')
    expect(copiedChild.parentId).toBe(copiedParent.id)          // tree remapped onto NEW ids
    expect(copiedParent.id).not.toBe(parent.id)
    expect(copiedChild.linkedScheduledTransferId).toBe('rule-1') // pointer kept (P1: only the active plan acts on it)
  })

  it('deletePlan refuses the active plan, cascades a draft with tombstones, never touches transfers', () => {
    seedStorage({ rmoney_envelope_scheduled: [{ id: 'rule-1', amount: 5 }] })
    const p1 = ensureDefaultPlan()
    const p2 = createPlan('Draft')
    createPlannedExpense({ name: 'Rent', amount: 500, amountBasis: 'monthly', planId: p2.id })

    expect(deletePlan(p1.id)).toBe(false)                        // active plan protected
    expect(deletePlan(p2.id)).toBe(true)
    expect(getPlans().map(p => p.id)).toEqual([p1.id])
    expect(getPlannedExpenses(p2.id)).toHaveLength(0)
    expect(readStorage('rmoney_envelope_scheduled')).toHaveLength(1)  // transfers untouched
    const tombstones = readStorage('rmoney_deletions') ?? []
    expect(tombstones.some(d => d.collection === 'rmoney_plans')).toBe(true)
    expect(tombstones.some(d => d.collection === 'rmoney_planned_expenses')).toBe(true)
  })

  it('clearTransferLinks clears the pointer on every plan referencing a deleted rule', () => {
    const p1 = ensureDefaultPlan()
    const leaf = createPlannedExpense({ name: 'A', amount: 1, amountBasis: 'monthly', planId: p1.id })
    updatePlannedExpense(leaf.id, { linkedScheduledTransferId: 'rule-9' })
    duplicatePlan(p1.id, 'Copy')                                 // second plan pointing at rule-9
    expect(getPlannedExpenses().filter(e => e.linkedScheduledTransferId === 'rule-9')).toHaveLength(2)
    clearTransferLinks('rule-9')
    expect(getPlannedExpenses().every(e => e.linkedScheduledTransferId === null)).toBe(true)
  })
})

describe('createPlannedExpense persistence (Phase 61f)', () => {
  beforeEach(() => seedStorage({}))
  afterEach(() => resetStorage())

  it('persists dayOfExecution and transferFrequency on CREATE (day was silently dropped before)', () => {
    createPlannedExpense({
      name: 'Insurance', envelopeId: 'env-1', sourceEnvelopeId: 'env-0',
      currency: 'EUR', amount: 600, amountBasis: 'yearly',
      dayOfExecution: 15, transferFrequency: 'yearly',
    })
    const stored = getPlannedExpenses()[0]
    expect(stored.dayOfExecution).toBe(15)
    expect(stored.transferFrequency).toBe('yearly')
  })

  it('leaves both null for group-only parents', () => {
    createPlannedExpense({ name: 'Housing', parentId: null })
    const stored = getPlannedExpenses()[0]
    expect(stored.dayOfExecution).toBeNull()
    expect(stored.transferFrequency).toBeNull()
  })
})
