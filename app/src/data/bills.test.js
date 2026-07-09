import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getDueDates, getNextOccurrenceDate } from './bills'

// Weekday reference for 2026: Jun 1 = Monday, so Jun 2/9/16/23/30 are Tuesdays.

describe('getDueDates', () => {
  it('one-time: due only when its date has arrived', () => {
    expect(getDueDates({ frequency: 'one-time', date: '2026-07-01' }, '2026-07-09'))
      .toEqual(['2026-07-01'])
    expect(getDueDates({ frequency: 'one-time', date: '2026-08-01' }, '2026-07-09'))
      .toEqual([])
  })

  it('monthly: starts at the first execution day on/after startDate', () => {
    const item = { frequency: 'monthly', dayOfExecution: 16, startDate: '2026-05-20' }
    expect(getDueDates(item, '2026-07-31')).toEqual(['2026-06-16', '2026-07-16'])
  })

  it('monthly: clamps day to short months instead of overflowing', () => {
    const item = { frequency: 'monthly', dayOfExecution: 31, startDate: '2026-01-01' }
    expect(getDueDates(item, '2026-04-30')).toEqual(
      ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('weekly: first matching weekday on/after startDate, step 7', () => {
    const item = { frequency: 'weekly', dayOfExecution: 2, startDate: '2026-06-03' } // Wed start, Tue target
    expect(getDueDates(item, '2026-06-30')).toEqual(
      ['2026-06-09', '2026-06-16', '2026-06-23', '2026-06-30'])
  })

  it('bi-weekly: anchored fortnight (the Phase 47b worked example)', () => {
    const item = { frequency: 'biweekly', dayOfExecution: 2, startDate: '2026-06-23' }
    expect(getDueDates(item, '2026-08-10')).toEqual(
      ['2026-06-23', '2026-07-07', '2026-07-21', '2026-08-04'])
  })

  it('honours endDate as the series cap', () => {
    const item = { frequency: 'monthly', dayOfExecution: 1, startDate: '2026-01-01', endDate: '2026-03-01' }
    expect(getDueDates(item, '2026-12-31')).toEqual(
      ['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('quarterly: every 3 months from the start month', () => {
    const item = { frequency: 'quarterly', dayOfExecution: 5, startDate: '2026-02-01' }
    expect(getDueDates(item, '2026-12-31')).toEqual(
      ['2026-02-05', '2026-05-05', '2026-08-05', '2026-11-05'])
  })

  it('yearly: same month each year', () => {
    const item = { frequency: 'yearly', dayOfExecution: 15, startDate: '2026-03-10' }
    expect(getDueDates(item, '2028-12-31')).toEqual(
      ['2026-03-15', '2027-03-15', '2028-03-15'])
  })
})

describe('getNextOccurrenceDate (clock-dependent — fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0)) // Thu 9 Jul 2026, local noon
  })
  afterEach(() => vi.useRealTimers())

  it('monthly: next execution day strictly after today', () => {
    expect(getNextOccurrenceDate({ frequency: 'monthly', dayOfExecution: 16, startDate: '2026-01-01' }))
      .toBe('2026-07-16')
    expect(getNextOccurrenceDate({ frequency: 'monthly', dayOfExecution: 1, startDate: '2026-01-01' }))
      .toBe('2026-08-01')
  })

  it('weekly: today itself never counts as "next"', () => {
    // Today is Thursday (4) — next Thursday is in 7 days, not today.
    expect(getNextOccurrenceDate({ frequency: 'weekly', dayOfExecution: 4, startDate: '2026-01-01' }))
      .toBe('2026-07-16')
    expect(getNextOccurrenceDate({ frequency: 'weekly', dayOfExecution: 2, startDate: '2026-01-01' }))
      .toBe('2026-07-14')
  })

  it('bi-weekly: keeps the anchor parity (skips the off week)', () => {
    // Series 23 Jun → 7 Jul → 21 Jul: from 9 Jul the next is 21 Jul, NOT Tue 14 Jul.
    expect(getNextOccurrenceDate({ frequency: 'biweekly', dayOfExecution: 2, startDate: '2026-06-23' }))
      .toBe('2026-07-21')
  })

  it('returns null once endDate is passed', () => {
    expect(getNextOccurrenceDate({ frequency: 'monthly', dayOfExecution: 16, startDate: '2026-01-01', endDate: '2026-07-01' }))
      .toBeNull()
  })

  it('one-time: only a future date is "next"', () => {
    expect(getNextOccurrenceDate({ frequency: 'one-time', date: '2026-08-01' })).toBe('2026-08-01')
    expect(getNextOccurrenceDate({ frequency: 'one-time', date: '2026-07-09' })).toBeNull()
  })
})
