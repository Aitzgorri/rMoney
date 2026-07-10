import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createPlannedExpense, getPlannedExpenses,
  plannedTransferFields, expenseSyncStatus, resetFieldsFromTransfer,
} from './planning'
import { seedStorage, resetStorage } from '../test/storage'

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
