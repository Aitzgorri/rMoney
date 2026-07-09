import { describe, it, expect } from 'vitest'
import { mergeSnapshots } from './mergeSnapshots'

// Three-way merge engine (SPEC-039, Phase 58d). Snapshots are backup-shaped;
// only the fields under test are included (the engine iterates what's present).

const tx = (id, updatedAt, extra = {}) => ({ id, amount: 1, updatedAt, ...extra })

describe('mergeSnapshots — record lists', () => {
  it('union: records added on either side are all present', () => {
    const base   = { transactions: [] }
    const local  = { transactions: [tx('a', '2026-07-01')] }
    const remote = { transactions: [tx('b', '2026-07-02')] }
    const { merged, changes } = mergeSnapshots(base, local, remote)
    expect(merged.transactions.map(t => t.id).sort()).toEqual(['a', 'b'])
    expect(changes).toEqual([])
  })

  it('edit-vs-edit: the newer updatedAt wins and the loss is logged', () => {
    const base   = { transactions: [tx('a', '2026-07-01', { amount: 10 })] }
    const local  = { transactions: [tx('a', '2026-07-05', { amount: 20 })] }
    const remote = { transactions: [tx('a', '2026-07-06', { amount: 30 })] }
    const { merged, changes } = mergeSnapshots(base, local, remote)
    expect(merged.transactions[0].amount).toBe(30)
    expect(changes).toEqual([{ field: 'transactions', id: 'a', action: 'kept-remote' }])
  })

  it('single-side edit resolves silently (no conflict log)', () => {
    const base   = { transactions: [tx('a', '2026-07-01', { amount: 10 })] }
    const local  = { transactions: [tx('a', '2026-07-01', { amount: 10 })] }
    const remote = { transactions: [tx('a', '2026-07-06', { amount: 30 })] }
    const { merged, changes } = mergeSnapshots(base, local, remote)
    expect(merged.transactions[0].amount).toBe(30)
    expect(changes).toEqual([])
  })

  it('records without updatedAt fall back to createdAt, and are older than stamped ones', () => {
    const legacy  = { id: 'a', amount: 10, createdAt: '2026-07-04T00:00:00.000Z' }
    const stamped = { id: 'a', amount: 20, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-05T00:00:00.000Z' }
    const { merged } = mergeSnapshots({}, { transactions: [legacy] }, { transactions: [stamped] })
    expect(merged.transactions[0].amount).toBe(20)
  })

  it('deletion via tombstone: deleted on one side, untouched on the other → stays deleted', () => {
    const base   = { transactions: [tx('a', '2026-07-01')] }
    const local  = { transactions: [], deletions: [{ collection: 'rmoney_transactions', id: 'a', deletedAt: '2026-07-05T00:00:00.000Z' }] }
    const remote = { transactions: [tx('a', '2026-07-01')] }
    const { merged, changes } = mergeSnapshots(base, local, remote)
    expect(merged.transactions).toEqual([])
    expect(merged.deletions).toHaveLength(1)   // tombstone survives for other devices
    expect(changes).toEqual([{ field: 'transactions', id: 'a', action: 'deleted' }])
  })

  it('edit-vs-delete: the newest timestamp wins in both directions', () => {
    const base = { transactions: [tx('a', '2026-07-01')] }
    const del  = { collection: 'rmoney_transactions', id: 'a', deletedAt: '2026-07-05T00:00:00.000Z' }

    // Edit AFTER the delete → the edit survives (and is logged).
    const editAfter = mergeSnapshots(base,
      { transactions: [], deletions: [del] },
      { transactions: [tx('a', '2026-07-06T00:00:00.000Z', { amount: 42 })] })
    expect(editAfter.merged.transactions).toHaveLength(1)
    expect(editAfter.merged.transactions[0].amount).toBe(42)
    expect(editAfter.changes).toContainEqual({ field: 'transactions', id: 'a', action: 'kept-edit-over-delete' })

    // Edit BEFORE the delete → the delete wins.
    const editBefore = mergeSnapshots(base,
      { transactions: [], deletions: [del] },
      { transactions: [tx('a', '2026-07-03T00:00:00.000Z', { amount: 42 })] })
    expect(editBefore.merged.transactions).toEqual([])
  })

  it('no resurrection on later syncs: the tombstone keeps winning', () => {
    // Device B never saw the deletion and still carries the old record.
    const del = { collection: 'rmoney_transactions', id: 'a', deletedAt: '2026-07-05T00:00:00.000Z' }
    const { merged } = mergeSnapshots(
      { transactions: [] },                                        // base after the first merged sync
      { transactions: [], deletions: [del] },
      { transactions: [tx('a', '2026-07-01')] })                   // stale copy
    expect(merged.transactions).toEqual([])
  })

  it('first sync (no base): both sides union cleanly', () => {
    const { merged, changes } = mergeSnapshots(null,
      { transactions: [tx('a', '2026-07-01')] },
      { transactions: [tx('b', '2026-07-02')] })
    expect(merged.transactions).toHaveLength(2)
    expect(changes).toEqual([])
  })
})

describe('mergeSnapshots — blobs and mixed shapes', () => {
  it('settings blob: single-side change wins silently; both changed → local wins, logged', () => {
    const base   = { settings: { mainCurrency: 'EUR', planningPeriodStartDay: 1 } }
    const remoteOnly = mergeSnapshots(base,
      { settings: { mainCurrency: 'EUR', planningPeriodStartDay: 1 } },
      { settings: { mainCurrency: 'EUR', planningPeriodStartDay: 10 } })
    expect(remoteOnly.merged.settings.planningPeriodStartDay).toBe(10)
    expect(remoteOnly.changes).toEqual([])

    const bothChanged = mergeSnapshots(base,
      { settings: { mainCurrency: 'GBP', planningPeriodStartDay: 1 } },
      { settings: { mainCurrency: 'EUR', planningPeriodStartDay: 10 } })
    expect(bothChanged.merged.settings.mainCurrency).toBe('GBP')   // local wins whole blob
    expect(bothChanged.changes).toEqual([{ field: 'settings', action: 'kept-local' }])
  })

  it('id-less lists merge as blobs (no per-record semantics assumed)', () => {
    const base   = { someList: [{ name: 'x' }] }
    const local  = { someList: [{ name: 'x' }] }
    const remote = { someList: [{ name: 'x' }, { name: 'y' }] }
    const { merged } = mergeSnapshots(base, local, remote)
    expect(merged.someList).toHaveLength(2)   // only remote changed → remote wins
  })

  it('a field missing on one side entirely is treated as unchanged there', () => {
    const { merged } = mergeSnapshots({},
      { transactions: [tx('a', '2026-07-01')] },
      {})   // e.g. older payload without the field
    expect(merged.transactions).toHaveLength(1)
  })

  it('deletions logs from both sides union with the newest deletedAt per record', () => {
    const { merged } = mergeSnapshots({},
      { deletions: [{ collection: 'rmoney_payees', id: 'p1', deletedAt: '2026-07-02T00:00:00.000Z' }] },
      { deletions: [{ collection: 'rmoney_payees', id: 'p1', deletedAt: '2026-07-04T00:00:00.000Z' },
                    { collection: 'rmoney_budgets', id: 'b1', deletedAt: '2026-07-03T00:00:00.000Z' }] })
    expect(merged.deletions).toHaveLength(2)
    expect(merged.deletions.find(d => d.id === 'p1').deletedAt).toBe('2026-07-04T00:00:00.000Z')
  })
})
