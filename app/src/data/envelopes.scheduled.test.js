import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextScheduledOccurrence, createScheduledTransfer, getScheduledTransfers, createEnvelopeTransfer, updateScheduledTransfer, migrateTransferAmounts, scheduledTransfersSummary } from './envelopes'
import { seedStorage, resetStorage, readStorage } from '../test/storage'

// nextScheduledOccurrence(s, fromDate) scans forward reusing the engine's own
// isScheduledTransferDueToday, so these tests cover both (Phase 49b/47c).
// Weekday reference for 2026: Jun 1 = Monday.

describe('nextScheduledOccurrence', () => {
  it('monthly day 16 from 10 Jun is 16 Jun — the "16→15" UTC regression', () => {
    const s = { frequency: 'monthly', dayOfExecution: 16 }
    expect(nextScheduledOccurrence(s, new Date(2026, 5, 10))).toBe('2026-06-16')
  })

  it('counts today itself when due ("on or after"), else moves a month on', () => {
    const s = { frequency: 'monthly', dayOfExecution: 16 }
    expect(nextScheduledOccurrence(s, new Date(2026, 5, 16))).toBe('2026-06-16')
    expect(nextScheduledOccurrence(s, new Date(2026, 5, 17))).toBe('2026-07-16')
  })

  it('weekly: next matching weekday', () => {
    const s = { frequency: 'weekly', dayOfExecution: 2 } // Tuesday
    expect(nextScheduledOccurrence(s, new Date(2026, 5, 11))).toBe('2026-06-16') // from Thu 11 Jun
  })

  it('bi-weekly: anchored on createdAt, skips the off week', () => {
    // createdAt Mon 1 Jun (local noon) → anchor = first Tuesday on/after = 2 Jun.
    // Series: 2 Jun → 16 Jun → 30 Jun. From 3 Jun the next is 16 Jun, NOT 9 Jun.
    const s = {
      frequency: 'biweekly', dayOfExecution: 2,
      createdAt: new Date(2026, 5, 1, 12).toISOString(),
    }
    expect(nextScheduledOccurrence(s, new Date(2026, 5, 3))).toBe('2026-06-16')
  })

  it('quarterly: fires in months 0/3/6/9 from the createdAt anchor month', () => {
    const s = {
      frequency: 'quarterly', dayOfExecution: 5,
      createdAt: new Date(2026, 5, 5, 12).toISOString(), // June 2026
    }
    expect(nextScheduledOccurrence(s, new Date(2026, 6, 1))).toBe('2026-09-05')
  })

  it('yearly: fires in the createdAt anchor month', () => {
    const s = {
      frequency: 'yearly', dayOfExecution: 5,
      createdAt: new Date(2026, 5, 5, 12).toISOString(), // June 2026
    }
    expect(nextScheduledOccurrence(s, new Date(2026, 6, 1))).toBe('2027-06-05')
  })

  it('returns null for an unrecognised frequency', () => {
    expect(nextScheduledOccurrence({ frequency: 'nonsense', dayOfExecution: 1 }, new Date(2026, 5, 1)))
      .toBeNull()
  })
})

describe('startDate anchor/gate (Phase 53f)', () => {
  it('nothing fires before an explicit start date — any frequency', () => {
    const monthly = { frequency: 'monthly', dayOfExecution: 16, startDate: '2026-08-01' }
    expect(nextScheduledOccurrence(monthly, new Date(2026, 5, 10))).toBe('2026-08-16')
    const weekly = { frequency: 'weekly', dayOfExecution: 2, startDate: '2026-07-01' }
    expect(nextScheduledOccurrence(weekly, new Date(2026, 5, 10))).toBe('2026-07-07')
  })

  it('bi-weekly parity anchors on startDate, not createdAt', () => {
    // createdAt Mon 1 Jun → legacy anchor Tue 2 Jun (series 2/16/30 Jun).
    // startDate 9 Jun shifts the series to 9/23 Jun — from 10 Jun the next
    // must be 23 Jun, which the createdAt anchor would NOT produce.
    const s = {
      frequency: 'biweekly', dayOfExecution: 2,
      createdAt: new Date(2026, 5, 1, 12).toISOString(),
      startDate: '2026-06-09',
    }
    expect(nextScheduledOccurrence(s, new Date(2026, 5, 10))).toBe('2026-06-23')
  })

  it('quarterly counts its months from the startDate month', () => {
    const s = {
      frequency: 'quarterly', dayOfExecution: 5,
      createdAt: new Date(2026, 5, 5, 12).toISOString(),  // June — would put the next fire in September
      startDate: '2026-07-05',                            // July anchor wins
    }
    expect(nextScheduledOccurrence(s, new Date(2026, 6, 1))).toBe('2026-07-05')
    expect(nextScheduledOccurrence(s, new Date(2026, 6, 6))).toBe('2026-10-05')
  })

  it('rules without startDate keep the legacy createdAt anchoring', () => {
    const s = {
      frequency: 'quarterly', dayOfExecution: 5,
      createdAt: new Date(2026, 5, 5, 12).toISOString(),
    }
    expect(nextScheduledOccurrence(s, new Date(2026, 6, 1))).toBe('2026-09-05')
  })
})

describe('createScheduledTransfer (storage-backed via the test helper)', () => {
  afterEach(resetStorage)

  it('persists coerced numbers and defaults, readable back out', () => {
    seedStorage({}) // empty store
    const created = createScheduledTransfer({
      fromEnvelopeId: 'env-a', toEnvelopeId: 'env-b',
      amount: '12.5', frequency: 'monthly', dayOfExecution: '16', // form-style strings
    })

    const stored = getScheduledTransfers()
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(created.id)
    expect(stored[0].amount).toBe(12.5)          // Number, never a string
    expect(stored[0].dayOfExecution).toBe(16)    // Number, never a string
    expect(stored[0].isActive).toBe(true)
    expect(stored[0].startDate).toBeNull()       // absent → legacy createdAt anchoring (53f)

    // And the raw collection landed under the expected key.
    expect(readStorage('rmoney_envelope_scheduled')).toHaveLength(1)
  })

  it('persists startDate and note when given (Phase 53f — note was silently dropped before)', () => {
    seedStorage({})
    createScheduledTransfer({
      fromEnvelopeId: 'env-a', toEnvelopeId: 'env-b',
      amount: 10, frequency: 'biweekly', dayOfExecution: 2,
      startDate: '2026-06-09', note: 'fortnightly top-up',
    })
    const stored = getScheduledTransfers()[0]
    expect(stored.startDate).toBe('2026-06-09')
    expect(stored.note).toBe('fortnightly top-up')
  })

  it('the created rule feeds the occurrence engine directly', () => {
    seedStorage({})
    createScheduledTransfer({
      fromEnvelopeId: 'env-a', toEnvelopeId: 'env-b',
      amount: 10, frequency: 'monthly', dayOfExecution: 16,
    })
    const rule = getScheduledTransfers()[0]
    expect(nextScheduledOccurrence(rule, new Date(2026, 5, 10))).toBe('2026-06-16')
  })
})

describe('amount rounding on write + repair migration (Phase 54a)', () => {
  afterEach(resetStorage)

  it('no write path persists sub-cent precision', () => {
    seedStorage({})
    // 100/12 — the Planning yearly÷12 class of value
    createScheduledTransfer({ fromEnvelopeId: 'a', toEnvelopeId: 'b', amount: 8.333333333333334, frequency: 'monthly', dayOfExecution: 1 })
    createEnvelopeTransfer({ fromEnvelopeId: 'a', toEnvelopeId: 'b', amount: 216.66666666666666, date: '2026-07-01' })
    expect(getScheduledTransfers()[0].amount).toBe(8.33)
    expect(readStorage('rmoney_envelope_transfers')[0].amount).toBe(216.67)

    updateScheduledTransfer(getScheduledTransfers()[0].id, { amount: 4.999999 })
    expect(getScheduledTransfers()[0].amount).toBe(5)
  })

  it('migrateTransferAmounts repairs stored strings AND sub-cent amounts', () => {
    seedStorage({
      rmoney_envelope_transfers: [
        { id: 't1', amount: 8.333333333333334 },   // sub-cent (the screenshot bug)
        { id: 't2', amount: '150' },               // legacy string (Phase 43)
        { id: 't3', amount: 25 },                  // already clean — untouched
        { id: 't4', amount: 'garbage' },           // malformed — left alone
      ],
      rmoney_envelope_scheduled: [
        { id: 's1', amount: 4.999999 },
      ],
    })
    migrateTransferAmounts()
    const t = readStorage('rmoney_envelope_transfers')
    expect(t.map(x => x.amount)).toEqual([8.33, 150, 25, 'garbage'])
    expect(readStorage('rmoney_envelope_scheduled')[0].amount).toBe(5)
  })
})

describe('createEnvelopeTransfer default date (Phase 53d — the UTC-midnight class)', () => {
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
  })

  it('defaults to the LOCAL calendar date, even just after local midnight', () => {
    seedStorage({})
    vi.useFakeTimers()
    // 00:30 local: toISOString() rolls back to the previous day in any UTC+ zone.
    vi.setSystemTime(new Date(2026, 6, 9, 0, 30, 0))
    createEnvelopeTransfer({ fromEnvelopeId: 'env-a', toEnvelopeId: 'env-b', amount: 5 })
    expect(readStorage('rmoney_envelope_transfers')[0].date).toBe('2026-07-09')
  })
})

describe('scheduledTransfersSummary (Phase 61b — per-frequency net sums + ÷12 monthly average)', () => {
  const FAM = new Set(['env-1', 'env-sub'])  // envelope + one descendant

  it('nets the RAW amounts per frequency (signed by family direction), in frequency order', () => {
    const scheduled = [
      { toEnvelopeId: 'env-1',   fromEnvelopeId: 'x', amount: 300,  frequency: 'monthly' },
      { fromEnvelopeId: 'env-1', toEnvelopeId: 'x',   amount: 100,  frequency: 'monthly' },
      { toEnvelopeId: 'env-sub', fromEnvelopeId: 'x', amount: 50,   frequency: 'weekly' },   // sub-envelope counts too
      { fromEnvelopeId: 'env-sub', toEnvelopeId: 'x', amount: 1200, frequency: 'yearly' },
    ]
    const r = scheduledTransfersSummary(scheduled, FAM)
    expect(r.byFrequency).toEqual([
      { frequency: 'weekly',  net: 50 },
      { frequency: 'monthly', net: 200 },
      { frequency: 'yearly',  net: -1200 },
    ])
    expect(r.allMonthly).toBe(false)
    // Average per month = yearly-equivalent total ÷ 12: 50×52/12 + 200 − 1200/12
    expect(r.monthlyAvg).toBeCloseTo(50 * 52 / 12 + 200 - 100, 10)
  })

  it('flags an all-monthly set — the UI shows no ≈ average for it', () => {
    const r = scheduledTransfersSummary(
      [{ toEnvelopeId: 'env-1', fromEnvelopeId: 'x', amount: 25, frequency: 'monthly' }], FAM)
    expect(r.allMonthly).toBe(true)
    expect(r.byFrequency).toEqual([{ frequency: 'monthly', net: 25 }])
    expect(r.monthlyAvg).toBe(25)
  })

  it('excludes family-internal transfers and unrelated ones; empty in → empty out', () => {
    const scheduled = [
      { fromEnvelopeId: 'env-1', toEnvelopeId: 'env-sub', amount: 40, frequency: 'monthly' }, // internal
      { fromEnvelopeId: 'a',     toEnvelopeId: 'b',       amount: 10, frequency: 'monthly' }, // unrelated
    ]
    expect(scheduledTransfersSummary(scheduled, FAM).byFrequency).toEqual([])
    expect(scheduledTransfersSummary([], FAM).byFrequency).toEqual([])
  })

  it('treats a missing frequency as monthly (legacy records) and accepts an array of ids', () => {
    const r = scheduledTransfersSummary([{ toEnvelopeId: 'env-1', amount: 25 }], ['env-1'])
    expect(r.byFrequency).toEqual([{ frequency: 'monthly', net: 25 }])
    expect(r.allMonthly).toBe(true)
  })
})
