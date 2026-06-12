// Shared helper for the "favorites at the top" convention (Phase 48).
//
// Given a list of entities (accounts / categories / envelopes …) and an ordered
// list of favorite IDs, return the favorites first (in the user's favorite
// order) and the rest after (in their original order). Stale favorite IDs —
// entities that were since archived or deleted — are simply skipped.
//
// Consumers render the two groups with a visual divider between them: the
// Dashboard account list (48c) and every favorites-aware dropdown (Phase 51).
export function splitFavorites(items, favoriteIds, getId = x => x.id) {
  const favSet = new Set(favoriteIds)
  const byId = new Map(items.map(it => [getId(it), it]))
  const favorites = favoriteIds.map(id => byId.get(id)).filter(Boolean)
  const rest = items.filter(it => !favSet.has(getId(it)))
  return { favorites, rest }
}
