import { describe, it, expect } from 'vitest'
import { localDateStr, formatDate } from './dates'

describe('localDateStr (the UTC-shift bug class — "day 16 shows as the 15th")', () => {
  it('returns the LOCAL calendar date, even at local midnight', () => {
    // toISOString() at local midnight rolls back a day in any UTC+ timezone;
    // localDateStr must not.
    expect(localDateStr(new Date(2026, 5, 16, 0, 0, 0))).toBe('2026-06-16')
    expect(localDateStr(new Date(2026, 5, 16, 23, 59, 59))).toBe('2026-06-16')
  })

  it('pads month and day', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('formatDate', () => {
  it('formats yyyy-mm-dd as "15 Apr 2026"', () => {
    expect(formatDate('2026-04-15')).toBe('15 Apr 2026')
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026')
  })

  it('returns empty string for falsy input', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate(null)).toBe('')
  })
})
