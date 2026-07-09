import { describe, it, expect, beforeEach } from 'vitest'
import { getTxAccountFilter, setTxAccountFilter } from './uiSession'

describe('uiSession tx account filter (Phase 53a)', () => {
  beforeEach(() => setTxAccountFilter(''))

  it('round-trips the active filter', () => {
    setTxAccountFilter('acc-1')
    expect(getTxAccountFilter()).toBe('acc-1')
  })

  it('normalises falsy values to the empty string (no filter)', () => {
    setTxAccountFilter('acc-1')
    setTxAccountFilter(undefined)
    expect(getTxAccountFilter()).toBe('')
  })
})
