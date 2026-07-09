import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  checkAndGeneratePending, getPendingOccurrences,
  countPastConfirmedOccurrences, applyAmountToPastOccurrences,
  getDuePendingOccurrences, getNextEffectiveOccurrence, applyOccurrenceOverride,
  getPlannedItems,
} from './bills'
import { getTransactions } from './transactions'
import { seedStorage, resetStorage, readStorage } from '../test/storage'

// Storage-backed engine tests (Phase 55a — edit scope "from now on").
// Today is faked to Thu 9 Jul 2026 local noon.
describe('checkAndGeneratePending with generatedFrom (Phase 55a)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
  })

  const baseItem = {
    id: 'item-1', isActive: true, type: 'expense', name: 'Rent',
    accountId: 'acc-1', amount: 100, currency: 'EUR',
    frequency: 'monthly', dayOfExecution: 5, startDate: '2026-05-01',
    applicationMode: 'auto-apply',
  }

  it('without generatedFrom, past due dates backfill (pre-55a behaviour, unchanged)', () => {
    seedStorage({ rmoney_bill_items: [baseItem] })
    checkAndGeneratePending()
    // May 5, Jun 5, Jul 5 are all ≤ today → three backfilled transactions
    expect(getTransactions().map(t => t.date).sort())
      .toEqual(['2026-05-05', '2026-06-05', '2026-07-05'])
  })

  it('generatedFrom suppresses every due date before it — the edit→transaction bug fix', () => {
    // The item was edited today: generation re-anchors to today, so the
    // schedule's past due dates (May/Jun/Jul 5) must NOT create transactions.
    seedStorage({ rmoney_bill_items: [{ ...baseItem, generatedFrom: '2026-07-09' }] })
    checkAndGeneratePending()
    expect(getTransactions()).toEqual([])
    expect(getPendingOccurrences()).toEqual([])
  })

  it('a due date ON generatedFrom (the user chose today) still fires', () => {
    // Day-of-month 9 = today. The user picked today intentionally → recorded.
    seedStorage({
      rmoney_bill_items: [{ ...baseItem, dayOfExecution: 9, generatedFrom: '2026-07-09' }],
    })
    checkAndGeneratePending()
    const txs = getTransactions()
    expect(txs).toHaveLength(1)
    expect(txs[0].date).toBe('2026-07-09')
  })

  it('outstanding items respect generatedFrom the same way', () => {
    seedStorage({
      rmoney_bill_items: [{ ...baseItem, applicationMode: 'outstanding', generatedFrom: '2026-07-09' }],
    })
    checkAndGeneratePending()
    expect(getPendingOccurrences()).toEqual([])
    expect(getTransactions()).toEqual([])
  })
})

describe('occurrence overrides (Phase 55d — one-time edits, skip, D4 immediate record)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0)) // Thu 9 Jul 2026
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
  })

  // Recurring on the 20th — next original occurrence is in the future.
  const item = (extra = {}) => ({
    id: 'i1', isActive: true, type: 'expense', name: 'Insurance',
    accountId: 'acc-1', amount: 50, currency: 'EUR',
    frequency: 'monthly', dayOfExecution: 20, startDate: '2026-07-01',
    applicationMode: 'outstanding', ...extra,
  })

  it('a date override pulled to today records IMMEDIATELY — even in outstanding mode (D4)', () => {
    seedStorage({ rmoney_bill_items: [item({ overrides: { '2026-07-20': { date: '2026-07-09', amount: 55 } } })] })
    checkAndGeneratePending()
    const txs = getTransactions()
    expect(txs).toHaveLength(1)
    expect(txs[0].date).toBe('2026-07-09')
    expect(txs[0].amount).toBe(55)
    const occ = getPendingOccurrences()[0]
    expect(occ.status).toBe('confirmed')
    expect(occ.seriesDate).toBe('2026-07-20')  // dedupe key = original schedule date
    expect(occ.dueDate).toBe('2026-07-09')     // effective date
    // The override is consumed (one-shot) …
    expect(getPlannedItems()[0].overrides).toEqual({})
    // … and a second run creates nothing new.
    checkAndGeneratePending()
    expect(getTransactions()).toHaveLength(1)
  })

  it('a date override pushed later delays generation past the original due date', () => {
    seedStorage({ rmoney_bill_items: [item({ dayOfExecution: 5, applicationMode: 'auto-apply', overrides: { '2026-07-05': { date: '2026-07-25' } } })] })
    checkAndGeneratePending()
    expect(getTransactions()).toEqual([])       // Jul 5 arrived, but moved to Jul 25
    expect(getPendingOccurrences()).toEqual([])
  })

  it('skip: recorded as skipped, no transaction, series continues', () => {
    seedStorage({ rmoney_bill_items: [item({ dayOfExecution: 5, applicationMode: 'auto-apply', overrides: { '2026-07-05': { skipped: true } } })] })
    checkAndGeneratePending()
    expect(getTransactions()).toEqual([])
    const occ = getPendingOccurrences()[0]
    expect(occ.status).toBe('skipped')
    expect(occ.seriesDate).toBe('2026-07-05')
    expect(getPlannedItems()[0].overrides).toEqual({})   // consumed
    // Next effective occurrence is the following month, untouched.
    expect(getNextEffectiveOccurrence(getPlannedItems()[0]).date).toBe('2026-08-05')
  })

  it('an amount-only override keeps the item mode (outstanding stays pending)', () => {
    seedStorage({ rmoney_bill_items: [item({ dayOfExecution: 5, overrides: { '2026-07-05': { amount: 42 } } })] })
    checkAndGeneratePending()
    expect(getTransactions()).toEqual([])          // no explicit date choice → no immediate record
    const occ = getPendingOccurrences()[0]
    expect(occ.status).toBe('pending')
    expect(occ.plannedAmount).toBe(42)
  })

  it('getNextEffectiveOccurrence reflects date/amount overrides and passes over skips', () => {
    seedStorage({})   // the derivation reads occurrence records now
    const i = item({ overrides: {
      '2026-07-20': { skipped: true },
      '2026-08-20': { date: '2026-08-15', amount: 60 },
    } })
    expect(getNextEffectiveOccurrence(i)).toMatchObject(
      { date: '2026-08-15', seriesDate: '2026-08-20', amount: 60, overridden: true })
  })

  it('applyOccurrenceOverride stores the delta and runs the engine at once', () => {
    seedStorage({ rmoney_bill_items: [item()] })
    applyOccurrenceOverride('i1', '2026-07-20', { date: '2026-07-09', amount: 48 })
    // Date chosen = today → recorded immediately (outstanding mode notwithstanding).
    const txs = getTransactions()
    expect(txs).toHaveLength(1)
    expect(txs[0].amount).toBe(48)
    expect(txs[0].date).toBe('2026-07-09')
  })

  it('a skip is one-shot AND one-click: the next occurrence advances immediately (bug fix)', () => {
    // The engine consumes a skip override by materializing a skipped occurrence
    // record — the effective-next derivation must honour that record, otherwise
    // the skipped date pops back into "upcoming" until a second skip.
    seedStorage({ rmoney_bill_items: [item()] })
    applyOccurrenceOverride('i1', '2026-07-20', { skipped: true })
    const it1 = getPlannedItems()[0]
    expect(it1.overrides).toEqual({})                                   // consumed
    expect(getNextEffectiveOccurrence(it1)?.date).toBe('2026-08-20')    // advanced after ONE click
  })

  it('a recorded-early occurrence no longer shows as upcoming (same bug class)', () => {
    seedStorage({ rmoney_bill_items: [item()] })
    applyOccurrenceOverride('i1', '2026-07-20', { date: '2026-07-09', amount: 48 })  // Record now
    expect(getTransactions()).toHaveLength(1)
    expect(getNextEffectiveOccurrence(getPlannedItems()[0])?.date).toBe('2026-08-20')
  })

  it('applyOccurrenceOverride with no effective change clears a prior override', () => {
    seedStorage({ rmoney_bill_items: [item({ overrides: { '2026-07-20': { amount: 99 } } })] })
    applyOccurrenceOverride('i1', '2026-07-20', { date: '2026-07-20', amount: 50 })  // back to item values
    expect(getPlannedItems()[0].overrides).toEqual({})
  })
})

describe('getDuePendingOccurrences (Phase 55c — the Dashboard confirm surface)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
  })

  it('returns only pending occurrences whose due date has arrived, enriched + oldest-first', () => {
    seedStorage({
      rmoney_bill_items: [
        { id: 'i1', isActive: true,  name: 'Rent',    type: 'expense' },
        { id: 'i2', isActive: false, name: 'Old gym', type: 'expense' },   // inactive → excluded
      ],
      rmoney_bill_pending: [
        { id: 'p1', plannedItemId: 'i1', dueDate: '2026-07-09', status: 'pending' },   // due today ✓
        { id: 'p2', plannedItemId: 'i1', dueDate: '2026-07-01', status: 'pending' },   // overdue ✓
        { id: 'p3', plannedItemId: 'i1', dueDate: '2026-07-20', status: 'pending' },   // future ✗
        { id: 'p4', plannedItemId: 'i1', dueDate: '2026-07-05', status: 'confirmed' }, // handled ✗
        { id: 'p5', plannedItemId: 'i2', dueDate: '2026-07-01', status: 'pending' },   // inactive item ✗
        { id: 'p6', plannedItemId: 'gone', dueDate: '2026-07-01', status: 'pending' }, // orphan ✗
      ],
    })
    const due = getDuePendingOccurrences()
    expect(due.map(p => p.id)).toEqual(['p2', 'p1'])
    expect(due[0].item.name).toBe('Rent')
  })
})

describe('past-amount rewrite (Phase 55a — opt-in scope, amount ONLY)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
  })

  function seedHistory() {
    seedStorage({
      rmoney_bill_items: [{ id: 'item-1', isActive: true, name: 'Rent', amount: 100, frequency: 'monthly' }],
      rmoney_bill_pending: [
        { id: 'o1', plannedItemId: 'item-1', dueDate: '2026-05-05', status: 'confirmed', transactionId: 't1' },
        { id: 'o2', plannedItemId: 'item-1', dueDate: '2026-06-05', status: 'confirmed', transactionId: 't2' },
        { id: 'o3', plannedItemId: 'item-1', dueDate: '2026-07-05', status: 'pending',   transactionId: null },
        { id: 'o4', plannedItemId: 'item-1', dueDate: '2026-04-05', status: 'skipped',   transactionId: null },
        { id: 'o5', plannedItemId: 'other',  dueDate: '2026-06-01', status: 'confirmed', transactionId: 't9' },
      ],
      rmoney_transactions: [
        { id: 't1', type: 'expense', date: '2026-05-05', amount: 100, accountId: 'acc-1', categoryId: 'c1', payeeName: 'Landlord', createdAt: '2026-05-05T08:00:00.000Z' },
        { id: 't2', type: 'expense', date: '2026-06-05', amount: 100, accountId: 'acc-1', categoryId: 'c1', payeeName: 'Landlord', createdAt: '2026-06-05T08:00:00.000Z' },
        { id: 't9', type: 'expense', date: '2026-06-01', amount: 50,  accountId: 'acc-1', createdAt: '2026-06-01T08:00:00.000Z' },
      ],
    })
  }

  it('countPastConfirmedOccurrences counts only this item\'s confirmed+linked occurrences', () => {
    seedHistory()
    expect(countPastConfirmedOccurrences('item-1')).toEqual({ count: 2, since: '2026-05-05' })
    expect(countPastConfirmedOccurrences('nope')).toEqual({ count: 0, since: null })
  })

  it('applyAmountToPastOccurrences rewrites ONLY the amount of linked transactions', () => {
    seedHistory()
    const n = applyAmountToPastOccurrences('item-1', 120)
    expect(n).toBe(2)

    const byId = Object.fromEntries(getTransactions().map(t => [t.id, t]))
    expect(byId.t1.amount).toBe(120)
    expect(byId.t2.amount).toBe(120)
    // Every other field is untouched — dates, account, category, payee.
    expect(byId.t1.date).toBe('2026-05-05')
    expect(byId.t1.accountId).toBe('acc-1')
    expect(byId.t1.categoryId).toBe('c1')
    expect(byId.t1.payeeName).toBe('Landlord')
    // Other items' transactions are untouched.
    expect(byId.t9.amount).toBe(50)
    // The occurrences record the new actual amount.
    const occs = readStorage('rmoney_bill_pending')
    expect(occs.find(o => o.id === 'o1').actualAmount).toBe(120)
    expect(occs.find(o => o.id === 'o3').actualAmount).toBeUndefined() // pending untouched
  })
})
