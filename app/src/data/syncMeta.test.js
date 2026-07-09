import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { recordDeletion, getDeletions, pruneDeletions, getSyncMeta, updateSyncMeta, getSyncBase, setSyncBase } from './syncMeta'
import { seedStorage, resetStorage } from '../test/storage'

describe('syncMeta (SPEC-039, Phase 58)', () => {
  beforeEach(() => {
    seedStorage({})
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStorage()
  })

  it('recordDeletion appends a tombstone with the storage key and timestamp', () => {
    recordDeletion('rmoney_transactions', 'tx-1')
    recordDeletion('rmoney_envelopes', 'env-1')
    recordDeletion('rmoney_envelopes', null)   // guard: no id → no tombstone
    const list = getDeletions()
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ collection: 'rmoney_transactions', id: 'tx-1' })
    expect(list[0].deletedAt).toBe(new Date(2026, 6, 9, 12, 0, 0).toISOString())
  })

  it('pruneDeletions drops tombstones older than the retention window', () => {
    seedStorage({ rmoney_deletions: [
      { collection: 'c', id: 'old',  deletedAt: '2025-12-01T00:00:00.000Z' },   // > 180 days ago
      { collection: 'c', id: 'kept', deletedAt: '2026-06-01T00:00:00.000Z' },
    ] })
    const dropped = pruneDeletions(180)
    expect(dropped).toBe(1)
    expect(getDeletions().map(d => d.id)).toEqual(['kept'])
  })

  it('getSyncMeta creates a stable device id once', () => {
    const first = getSyncMeta()
    expect(first.deviceId).toMatch(/^dev_/)
    expect(getSyncMeta().deviceId).toBe(first.deviceId)
    updateSyncMeta({ dirty: true })
    expect(getSyncMeta()).toMatchObject({ deviceId: first.deviceId, dirty: true })
  })

  it('base snapshot round-trips and defaults to null', () => {
    expect(getSyncBase()).toBeNull()
    setSyncBase({ version: 'rmoney-data-v6', transactions: [] })
    expect(getSyncBase()).toMatchObject({ version: 'rmoney-data-v6' })
  })
})
