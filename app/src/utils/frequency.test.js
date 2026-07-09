import { describe, it, expect } from 'vitest'
import {
  FREQUENCIES, RECURRING_FREQUENCIES, FREQUENCY_LABELS,
  dayPickerKind, dayLabel, monthlyEquivalent, convertAmount,
} from './frequency'

describe('frequency option sets', () => {
  it('offers the full unified set in order (Phase 47)', () => {
    expect(FREQUENCIES.map(f => f.value)).toEqual(
      ['one-time', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])
  })

  it('recurring subset excludes one-time', () => {
    expect(RECURRING_FREQUENCIES.some(f => f.value === 'one-time')).toBe(false)
    expect(RECURRING_FREQUENCIES).toHaveLength(FREQUENCIES.length - 1)
  })

  it('derives labels', () => {
    expect(FREQUENCY_LABELS.biweekly).toBe('Bi-weekly')
    expect(FREQUENCY_LABELS.quarterly).toBe('Quarterly')
  })
})

describe('dayPickerKind', () => {
  it('weekly/bi-weekly use a weekday picker', () => {
    expect(dayPickerKind('weekly')).toBe('weekday')
    expect(dayPickerKind('biweekly')).toBe('weekday')
  })

  it('monthly/quarterly/yearly use a month-day picker', () => {
    expect(dayPickerKind('monthly')).toBe('month-day')
    expect(dayPickerKind('quarterly')).toBe('month-day')
    expect(dayPickerKind('yearly')).toBe('month-day')
  })

  it('one-time and unknown need no day picker', () => {
    expect(dayPickerKind('one-time')).toBe('none')
    expect(dayPickerKind('nonsense')).toBe('none')
  })
})

describe('dayLabel', () => {
  it('renders weekday names for weekday pickers', () => {
    expect(dayLabel('weekly', 2)).toBe('Tuesday')
    expect(dayLabel('biweekly', 5)).toBe('Friday')
  })

  it('renders ordinal-ish day for month-day pickers', () => {
    expect(dayLabel('monthly', 15)).toBe('15th')
    expect(dayLabel('yearly', 1)).toBe('1th')
  })

  it('renders empty for one-time', () => {
    expect(dayLabel('one-time', 5)).toBe('')
  })
})

describe('monthlyEquivalent (Phase 52b — fixes the ×52/12-for-everything bug)', () => {
  it('converts each recurring frequency', () => {
    expect(monthlyEquivalent(120, 'weekly')).toBe(520)
    expect(monthlyEquivalent(100, 'biweekly')).toBeCloseTo(216.6667, 3)
    expect(monthlyEquivalent(50, 'monthly')).toBe(50)
    expect(monthlyEquivalent(300, 'quarterly')).toBe(100)
    expect(monthlyEquivalent(120, 'yearly')).toBe(10)
  })

  it('one-time and unknown contribute 0 (projected into their month instead)', () => {
    expect(monthlyEquivalent(99, 'one-time')).toBe(0)
    expect(monthlyEquivalent(99, undefined)).toBe(0)
  })

  it('coerces non-numeric amounts to 0', () => {
    expect(monthlyEquivalent('abc', 'monthly')).toBe(0)
  })
})

describe('convertAmount (planning period basis)', () => {
  it('converts between monthly/quarterly/yearly', () => {
    expect(convertAmount(1200, 'yearly', 'monthly')).toBe(100)
    expect(convertAmount(100, 'monthly', 'quarterly')).toBe(300)
    expect(convertAmount(300, 'quarterly', 'yearly')).toBe(1200)
  })

  it('returns one-time and same-basis amounts unchanged', () => {
    expect(convertAmount(75, 'one-time', 'monthly')).toBe(75)
    expect(convertAmount(75, 'monthly', 'monthly')).toBe(75)
  })

  it('accepts weekly/bi-weekly as a FROM basis via their monthly equivalent (Phase 53b)', () => {
    expect(convertAmount(120, 'weekly', 'monthly')).toBe(520)
    expect(convertAmount(120, 'weekly', 'yearly')).toBe(6240)
    expect(convertAmount(100, 'biweekly', 'monthly')).toBeCloseTo(216.6667, 3)
    expect(convertAmount(100, 'biweekly', 'quarterly')).toBe(650)
  })

  it('passes unknown bases through unchanged', () => {
    expect(convertAmount(9, 'nonsense', 'monthly')).toBe(9)
  })
})
