// Shared utilities for tree drag-and-drop reparenting.
// Used by Categories, Envelopes, and Planning (expenses).

// Returns a Set of all descendant ids of the given item id.
export function getDescendantIds(id, items) {
  const result = new Set()
  function walk(parentId) {
    for (const item of items) {
      if (item.parentId === parentId) {
        result.add(item.id)
        walk(item.id)
      }
    }
  }
  walk(id)
  return result
}
