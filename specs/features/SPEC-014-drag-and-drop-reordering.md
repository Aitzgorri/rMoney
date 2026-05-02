---
id: SPEC-014
name: Drag and Drop Reordering
status: done
created: 2026-04-10
---

# Drag and Drop Reordering

## Goal
Let the user reparent hierarchical items — categories, envelopes, and planned expenses — by dragging them onto a different parent. Currently, changing a parent requires editing the item and picking a new parent from a dropdown, which is cumbersome when reorganising multiple items.

Items remain **alphabetically sorted within their parent** at all times. Drag-and-drop does not change order within the same parent — it only moves an item to a different parent, where it immediately takes its alphabetical position.

## User Stories
- As a user, I can drag a planned expense item and drop it onto a different parent so that I can reorganise my expense tree quickly
- As a user, I can drag a category and drop it onto a different parent so that I can restructure my category tree
- As a user, I can drag an envelope and drop it onto a different parent so that I can restructure my envelope tree
- As a user, I get clear visual feedback during a drag (highlighted drop target) so I know where the item will land

## Acceptance Criteria

### Shared drag-and-drop behaviour
- [x] Library: `@dnd-kit/core` — used for all drag-and-drop interactions across all tree screens
- [x] Drag is initiated by a long-press (touch) or mouse-drag (desktop) on a drag handle icon (≡) shown on each draggable row
- [x] During drag, the dragged item is visually lifted (reduced opacity + shadow)
- [x] Valid drop targets are **parent containers** only — the target row is highlighted (border or background) while hovering over it
- [x] There is no "between items" drop indicator — items always land alphabetically within the target parent, so no insertion line is needed
- [x] Dropping onto the item's **current parent** is a no-op (no change, no error)
- [x] Dropping an item onto **itself** or any of **its own descendants** is rejected — visual feedback (red highlight or cursor change), no change applied
- [x] Dropping onto a **leaf** that cannot become a parent is rejected — visual feedback, no change applied
- [x] The drag-and-drop interaction is a shared utility/component reused across all tree screens

### Planned expenses (SPEC-009)
- [x] Expense items (leaf or parent) can be dragged onto any other parent item to reparent them
- [x] Reparenting a leaf under a new **leaf** triggers the same leaf→parent conversion confirmation as editing the parent field (the drop target becomes a parent — the user must confirm)
- [x] Dragging a parent moves all its descendants with it
- [x] Built-in planned expense items (if any) cannot be dragged

### Categories (SPEC-003)
- [x] Category items can be dragged onto any other category of the **same type** (income/expense) to reparent them
- [x] Dragging across the income/expense type boundary is rejected — visual feedback, no change applied
- [x] Built-in categories (e.g. "Uncategorized income", "Uncategorized expense") cannot be dragged

### Envelopes (SPEC-004)
- [x] Envelope items can be dragged onto any other envelope to reparent them
- [x] Built-in envelopes (e.g. "Undistributed income", "Unassigned expenses") cannot be dragged

## UI / Screens

```
DRAG INTERACTION — hover over target parent highlights it
+----------------------------------------------+
|  ≡  > Housing           55.8  14,400  1,200  |  <- drag handle (≡)
|  ≡     Rent             46.5  12,000  1,000  |
|  ≡     Utilities         9.3   2,400    200  |
|                                              |
| [> Car               11.6   3,000    250]    |  <- highlighted: valid drop target
|  ≡     Gasoline          9.3   2,400    200  |
|  ≡     Insurance         2.3     600     50  |  <- being dragged (lifted, faded)
|  ≡  Groceries           18.6   4,800    400  |
+----------------------------------------------+

After drop: "Insurance" lands alphabetically inside "Car"
+----------------------------------------------+
|  ≡  > Housing           ...                  |
|  ≡  > Car               ...                  |
|  ≡     Gasoline         ...                  |
|  ≡     Insurance        ...                  |  <- now a child of Car, sorted alpha
|  ≡  Groceries           ...                  |
+----------------------------------------------+
```

## Data
No new data types. Drag-and-drop updates one existing field:
- `parentId` — changed to the new parent's id when reparenting, or to `null` when dropping at root level

No `order` field is needed — alphabetical sorting is always applied within each parent.

## Out of Scope
- Reordering items within the same parent (alphabetical sort is always applied — custom order is not supported)
- Planned incomes (flat list with no parent hierarchy — drag-and-drop provides no value here)
- Drag-and-drop for dashboard widgets (already has up/down buttons, keep as-is)
- Drag-and-drop for transactions or accounts
- Multi-select drag (dragging multiple items at once)
- Keyboard-based reordering (accessibility alternative — future)

## Open Questions
- None. Resolved:
  - **Sorting**: alphabetical always; drag-and-drop is for reparenting only, not reordering within a level
  - **Library**: `@dnd-kit/core`
