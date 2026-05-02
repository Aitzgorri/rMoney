// Shared helpers for rendering hierarchical envelope/category dropdowns.
// See CLAUDE.md → "UI Conventions" for the rule.

export const INDENT = '\u00A0\u00A0\u00A0\u00A0' // 4 non-breaking spaces per level

// Returns a label like "\u00A0\u00A0\u00A0\u00A0Child" for a flat-list item
// with a `depth` field (as produced by getEnvelopesFlat / getCategoriesFlat).
export function indentLabel(item) {
  return INDENT.repeat(item.depth) + item.name
}
