import { describe, it, expect } from 'vitest'
import { round2, fmtAmt, fmtSigned, fmtPriceAmt, parseAmount } from './format'

// The thousands separator fmtAmt emits (narrow no-break space, U+202F),
// written as an escape so no invisible character hides in this file.
const S = '\u202F'

describe('round2', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(1.226)).toBe(1.23)
    expect(round2(1.224)).toBe(1.22)
    expect(round2(-2.567)).toBe(-2.57)
  })

  it('normalises -0 and sub-cent residue to +0 (the "-0.00" bug class)', () => {
    expect(Object.is(round2(-0), 0)).toBe(true)
    expect(Object.is(round2(-0.0001), 0)).toBe(true)
    expect(round2(1e-9)).toBe(0)
  })

  it('coerces numeric strings', () => {
    expect(round2('3.14159')).toBe(3.14)
  })
})

describe('fmtAmt', () => {
  it('renders comma decimal + narrow-space thousands', () => {
    expect(fmtAmt(2440.75)).toBe(`2${S}440,75`)
    expect(fmtAmt(1234567.891)).toBe(`1${S}234${S}567,89`)
    expect(fmtAmt(12)).toBe('12,00')
  })

  it('never renders "-0.00"', () => {
    expect(fmtAmt(-0.001)).toBe('0,00')
    expect(fmtAmt(-0)).toBe('0,00')
  })

  it('keeps the sign for genuine negatives', () => {
    expect(fmtAmt(-5)).toBe('-5,00')
  })

  it('formats non-finite input as 0,00', () => {
    expect(fmtAmt(NaN)).toBe('0,00')
    expect(fmtAmt(undefined)).toBe('0,00')
  })
})

describe('fmtSigned', () => {
  it('adds + for positives, keeps - for negatives, no sign for zero', () => {
    expect(fmtSigned(5)).toBe('+5,00')
    expect(fmtSigned(-3.5)).toBe('-3,50')
    expect(fmtSigned(0)).toBe('0,00')
  })

  it('renders an em-dash for missing values', () => {
    expect(fmtSigned(null)).toBe('—')
    expect(fmtSigned(NaN)).toBe('—')
  })
})

describe('fmtPriceAmt', () => {
  it('uses 2..maxDp decimals with comma separator', () => {
    expect(fmtPriceAmt(1.23456)).toBe('1,2346')
    expect(fmtPriceAmt(2)).toBe('2,00')
    expect(fmtPriceAmt(1234.5)).toBe(`1${S}234,50`) // 2-decimal minimum always applies
  })

  it('renders an em-dash for missing values', () => {
    expect(fmtPriceAmt(null)).toBe('—')
    expect(fmtPriceAmt('abc')).toBe('—')
  })
})

describe('parseAmount', () => {
  it('accepts comma or dot as decimal separator', () => {
    expect(parseAmount('1234,56')).toBe(1234.56)
    expect(parseAmount('12.34')).toBe(12.34)
  })

  it('strips whitespace (including thousands spaces)', () => {
    expect(parseAmount('1 234,56')).toBe(1234.56)
  })

  it('round-trips fmtAmt output', () => {
    expect(parseAmount(fmtAmt(1234.56))).toBe(1234.56)
  })

  it('returns NaN for empty/invalid input, passes numbers through', () => {
    expect(parseAmount('')).toBeNaN()
    expect(parseAmount(null)).toBeNaN()
    expect(parseAmount('1,234.56')).toBeNaN() // first comma is the decimal point by design
    expect(parseAmount(7)).toBe(7)
  })
})
