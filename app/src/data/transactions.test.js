import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getTransactions, createTransaction, getLastUsedAccountId } from './transactions'
import { seedStorage, resetStorage } from '../test/storage'

describe('transaction ordering (Phase 49a — date desc, then entry time desc)', () => {
  beforeEach(() => {
    seedStorage({})
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
  })

  it('the last transaction entered for a date sits at the top of that date', () => {
    vi.setSystemTime(new Date(2026, 6, 1, 10, 0, 0))
    const first = createTransaction({ type: 'expense', date: '2026-07-01', amount: 5 })

    vi.setSystemTime(new Date(2026, 6, 1, 11, 0, 0))
    const older = createTransaction({ type: 'expense', date: '2026-06-30', amount: 6 })

    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0))
    const last = createTransaction({ type: 'expense', date: '2026-07-01', amount: 7 })

    const ids = getTransactions().map(t => t.id)
    // Same date (Jul 1): the later-entered one first; the older date last.
    expect(ids).toEqual([last.id, first.id, older.id])
  })

  it('stamps createdAt on creation', () => {
    vi.setSystemTime(new Date(2026, 6, 1, 10, 0, 0))
    const tx = createTransaction({ type: 'expense', date: '2026-07-01', amount: 5 })
    expect(tx.createdAt).toBe(new Date(2026, 6, 1, 10, 0, 0).toISOString())
  })
})

describe('getLastUsedAccountId (Phase 53a — last-used prefill fallback)', () => {
  beforeEach(() => {
    seedStorage({})
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
  })

  it('returns the account of the newest transaction in list order (date first)', () => {
    vi.setSystemTime(new Date(2026, 6, 1, 10, 0, 0))
    createTransaction({ type: 'expense', date: '2026-07-05', accountId: 'acc-1', amount: 5 })
    vi.setSystemTime(new Date(2026, 6, 1, 11, 0, 0))
    createTransaction({ type: 'expense', date: '2026-07-01', accountId: 'acc-2', amount: 6 }) // older date, newer entry
    expect(getLastUsedAccountId()).toBe('acc-1') // ordering is date-first: Jul 5 beats Jul 1
  })

  it('skips transfers (which have no accountId)', () => {
    vi.setSystemTime(new Date(2026, 6, 1, 10, 0, 0))
    createTransaction({ type: 'expense', date: '2026-07-01', accountId: 'acc-1', amount: 5 })
    vi.setSystemTime(new Date(2026, 6, 1, 11, 0, 0))
    createTransaction({ type: 'transfer', date: '2026-07-01', sourceAccountId: 'acc-2', destinationAccountId: 'acc-3', sourceAmount: 9, destinationAmount: 9 })
    expect(getLastUsedAccountId()).toBe('acc-1')
  })

  it('returns null when no transaction carries an account', () => {
    expect(getLastUsedAccountId()).toBeNull()
  })
})
