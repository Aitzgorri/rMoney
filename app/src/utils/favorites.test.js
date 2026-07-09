import { describe, it, expect } from 'vitest'
import { splitFavorites } from './favorites'

const items = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
  { id: 'd', name: 'Delta' },
]

describe('splitFavorites (Phase 48d — now load-bearing for every favorites dropdown)', () => {
  it('returns favorites in the USER order, rest in original order', () => {
    const { favorites, rest } = splitFavorites(items, ['c', 'a'])
    expect(favorites.map(i => i.id)).toEqual(['c', 'a'])
    expect(rest.map(i => i.id)).toEqual(['b', 'd'])
  })

  it('skips stale favorite ids (archived/deleted entities)', () => {
    const { favorites, rest } = splitFavorites(items, ['x', 'b'])
    expect(favorites.map(i => i.id)).toEqual(['b'])
    expect(rest.map(i => i.id)).toEqual(['a', 'c', 'd'])
  })

  it('empty favorites → everything stays in the rest, in order', () => {
    const { favorites, rest } = splitFavorites(items, [])
    expect(favorites).toEqual([])
    expect(rest.map(i => i.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('supports a custom id getter', () => {
    const coded = [{ code: 'EUR' }, { code: 'USD' }, { code: 'GBP' }]
    const { favorites, rest } = splitFavorites(coded, ['GBP', 'EUR'], x => x.code)
    expect(favorites.map(i => i.code)).toEqual(['GBP', 'EUR'])
    expect(rest.map(i => i.code)).toEqual(['USD'])
  })
})
