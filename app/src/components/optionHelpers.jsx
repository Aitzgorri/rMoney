// Shared favorites-aware <option> builders (Phase 53e) — the Phase 51c
// rendering conventions extracted so every entity dropdown renders favorites
// identically:
//   • flat lists (accounts): ★ favorites first, a disabled divider, then the rest
//   • hierarchical lists (categories / envelopes): a "Favorites" optgroup above
//     the FULL indented tree — favorites are a shortcut, the tree stays complete
import { splitFavorites } from '../utils/favorites'
import { INDENT } from '../utils/hierarchy'

export const DIVIDER = '─────────'   // disabled separator between favorites and the rest

export function accountOptions(accounts, favoriteIds) {
  const { favorites, rest } = splitFavorites(accounts, favoriteIds)
  return (
    <>
      {favorites.map(a => <option key={`f${a.id}`} value={a.id}>★ {a.accountName} ({a.currency})</option>)}
      {favorites.length > 0 && <option disabled>{DIVIDER}</option>}
      {rest.map(a => <option key={a.id} value={a.id}>{a.accountName} ({a.currency})</option>)}
    </>
  )
}

// The "Favorites" optgroup for a hierarchical dropdown, or null when empty.
// `items` is the flat tree list (each with id/name); `excludeIds` suppresses
// entries already shown in a block above (e.g. payee-recents) to avoid dupes.
export function favoritesOptgroup(items, favoriteIds, excludeIds = []) {
  const byId = new Map(items.map(i => [i.id, i]))
  const exclude = new Set(excludeIds)
  const favs = favoriteIds.map(id => byId.get(id)).filter(Boolean).filter(i => !exclude.has(i.id))
  if (favs.length === 0) return null
  return (
    <optgroup label="Favorites">
      {favs.map(i => <option key={`fav${i.id}`} value={i.id}>★ {i.name}</option>)}
    </optgroup>
  )
}

// The full indented tree options (MANDATORY hierarchy convention).
export function treeOptions(items) {
  return items.map(i => <option key={i.id} value={i.id}>{INDENT.repeat(i.depth)}{i.name}</option>)
}
