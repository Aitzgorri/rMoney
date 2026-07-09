import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  checkAndGeneratePending, getPendingOccurrences,
  countPastConfirmedOccurrences, applyAmountToPastOccurrences,
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
