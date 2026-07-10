import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getEnvelopesFlat } from './envelopes'
import { getCategoriesFlat } from './categories'
import { seedStorage, resetStorage } from '../test/storage'

// Phase 66f — user-reported: an ACTIVE envelope two levels deep could not be
// picked in any dropdown. Root cause: the flat-tree walk only descends through
// parents present in the passed set, so filtering out an archived ancestor
// silently dropped the whole (still active) subtree from every picker.
// Fix: subtrees whose parent is missing from the set are appended as roots.

describe('getEnvelopesFlat (Phase 66f — orphaned subtrees stay pickable)', () => {
  it('keeps an active envelope whose ancestor was filtered out (archived) — as a root', () => {
    const active = [
      { id: 'gp', name: 'Grand', parentId: null },
      // 'p' (the middle parent) is archived and filtered out by the caller
      { id: 'c', name: 'Child', parentId: 'p' },
    ]
    const flat = getEnvelopesFlat(active)
    expect(flat.map(e => e.id)).toContain('c')
    expect(flat.find(e => e.id === 'c').depth).toBe(0)
  })

  it('walks an orphaned subtree into its own deeper levels', () => {
    const active = [
      { id: 'c',  name: 'Child',      parentId: 'p-gone' },
      { id: 'cc', name: 'Grandchild', parentId: 'c' },
    ]
    const flat = getEnvelopesFlat(active)
    expect(flat.map(e => e.id)).toEqual(['c', 'cc'])
    expect(flat.find(e => e.id === 'cc').depth).toBe(1)
  })

  it('normal nesting is unchanged', () => {
    const all = [
      { id: 'a', name: 'A', parentId: null },
      { id: 'b', name: 'B', parentId: 'a' },
    ]
    expect(getEnvelopesFlat(all).map(e => [e.id, e.depth])).toEqual([['a', 0], ['b', 1]])
  })
})

describe('getCategoriesFlat (Phase 66f — same orphaned-subtree fix)', () => {
  beforeEach(() => seedStorage({
    rmoney_categories: [
      { id: 'p', name: 'Parent', type: 'expense', parentId: null, isArchived: true },
      { id: 'c', name: 'Child',  type: 'expense', parentId: 'p' },
    ],
  }))
  afterEach(() => resetStorage())

  it('keeps an active category under an archived parent', () => {
    expect(getCategoriesFlat('expense').map(c => c.id)).toContain('c')
  })
})
