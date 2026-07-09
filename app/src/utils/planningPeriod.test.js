import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getCurrentPeriod, getPreviousPeriod, isInPeriod, selectPeriodTransactions } from './planningPeriod'
import { seedStorage, resetStorage } from '../test/storage'
import { localDateStr } from './dates'

// Period start day 10; today faked to 15 Jul 2026 → current period 10 Jul – 9 Aug,
// previous period 10 Jun – 9 Jul. (The user's own worked example from the notes.)
describe('planning period attribution (Phase 55f)', () => {
  beforeEach(() => {
    seedStorage({ rmoney_settings: { planningPeriodStartDay: 10 } })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
  })

  it('getPreviousPeriod is the period immediately before the current one', () => {
    expect(localDateStr(getCurrentPeriod().start)).toBe('2026-07-10')
    expect(localDateStr(getCurrentPeriod().end)).toBe('2026-08-09')
    const prev = getPreviousPeriod()
    expect(localDateStr(prev.start)).toBe('2026-06-10')
    expect(localDateStr(prev.end)).toBe('2026-07-09')
  })

  it('isInPeriod is inclusive of both boundaries', () => {
    const prev = getPreviousPeriod()
    expect(isInPeriod('2026-06-10', prev)).toBe(true)
    expect(isInPeriod('2026-07-09', prev)).toBe(true)
    expect(isInPeriod('2026-07-10', prev)).toBe(false)
    expect(isInPeriod('2026-06-09', prev)).toBe(false)
  })

  it('selectPeriodTransactions: periodShift "next" moves a transaction into the following period', () => {
    const txs = [
      { id: 'a', type: 'income',  date: '2026-07-12', amount: 10 },                        // in period ✓
      { id: 'b', type: 'income',  date: '2026-07-07', amount: 20, periodShift: 'next' },   // wage on the 7th → counts here ✓
      { id: 'c', type: 'income',  date: '2026-07-07', amount: 30 },                        // previous period ✗
      { id: 'd', type: 'income',  date: '2026-07-12', amount: 40, periodShift: 'next' },   // belongs to NEXT period ✗
      { id: 'e', type: 'expense', date: '2026-07-20', amount: 50 },                        // in period ✓
      { id: 'f', type: 'transfer', date: '2026-07-12', sourceAmount: 60 },                 // transfers excluded ✗
    ]
    expect(selectPeriodTransactions(txs).map(t => t.id)).toEqual(['a', 'b', 'e'])
  })
})
