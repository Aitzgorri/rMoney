---
id: SPEC-022
name: Portfolios
status: done
created: 2026-04-23
---

# Portfolios

## Goal
Let the user build nested hierarchies of "Portfolios" — user-defined groupings of investments where the same investment can belong to **multiple** overlapping portfolios at once, with optional target allocation percentages. A portfolio node may have a target % for itself within its parent (sibling targets must sum to 100% at each level), and an individual stock can have a different target % in each portfolio it belongs to. Used by SPEC-023 (per-Portfolio benchmarks) and SPEC-024 (portfolio-breakdown reports, share-vs-target comparisons).

This is distinct from the existing SPEC-003 **Categories** (income/expense categorization for transactions). The spec was originally called "Category groups" in project goal.md but renamed to **Portfolios** during review to eliminate the collision.

## User Stories
- As a user, I can create a portfolio called "By sector" with nested portfolios "Technology", "Financials", "Healthcare", and assign each stock I hold to one or more of those leaves, so I can see my sector exposure.
- As a user, I can create a second, overlapping portfolio "High conviction" and put the same stocks into it alongside different stocks, without the "By sector" assignments being affected.
- As a user, I can set a target % for a portfolio node — e.g. "Technology" should be 30% of "By sector" — and the app warns me if my sibling targets don't sum to 100%.
- As a user, I can set a target % on an individual stock within a portfolio — e.g. "Apple should be 8% of Technology" — and the target can differ between the two portfolios the stock is in.
- As a user, I can drag and drop to reorder or re-parent portfolio nodes.

## Acceptance Criteria
- [x] CRUD operations on portfolio nodes: create, edit name, delete, reorder within siblings, re-parent to a different portfolio.
- [x] Portfolios form a nested tree reusing the existing hierarchical tree component (same UX as Envelopes / Categories / Planned expenses / Planning).
- [x] One investment (stock identified by ticker) can be assigned to many portfolios. Assignment is a many-to-many relation — assigning to portfolio B doesn't remove the investment from portfolio A.
- [x] Optional target % on any portfolio node: a portfolio node may be left with no target or explicitly set to one. When targets are set among siblings under the same parent, they should sum to 100%. If they don't, the UI shows a non-blocking validation warning but does not block editing or saving.
- [x] Optional target % on an item within a portfolio: when a stock is assigned to a portfolio node, the user may set a target % for that stock within that specific portfolio context. The same stock can have different targets in different portfolios.
- [x] Target % for sibling items within the same portfolio parent may also be validated to sum to 100% (warning, not blocking).
- [x] Drag-and-drop reparenting uses `@dnd-kit/core` (same as Categories / Envelopes). Up/down arrows handle sibling reordering. `utils/treeDnd.js` `getDescendantIds` guards against dropping onto own descendants.
- [x] Deleting a portfolio node shows a confirmation that lists all descendant nodes and all item assignments that will be removed. Tickers shared in other portfolios are noted. The user must confirm before deletion proceeds.

## UI / Screens
Portfolios page (text sketch — desktop inline form for add):

```
+----------------------------------------------------------+
| Portfolios                             [+ New portfolio] |
+----------------------------------------------------------+
| By sector            (100% target)                        |
|  ├─ Technology        30%                                  |
|  │   ├─ AAPL           8%                                  |
|  │   ├─ MSFT           8%                                  |
|  │   └─ NVDA           5%                                  |
|  ├─ Financials        25%                                  |
|  └─ Healthcare        20%   ⚠ siblings sum to 75%         |
|                                                           |
| High conviction      (100%)                               |
|  ├─ AAPL              15%                                 |
|  ├─ MSFT              12%                                 |
|  └─ ASML              10%                                 |
+----------------------------------------------------------+
```

Assignment is managed from the stock page (SPEC-021) as well, via a "Portfolios" section with checkboxes + per-portfolio target inputs.

Cascade-delete confirmation:

```
Delete "Technology"?
This will also remove:
  • 3 sub-portfolios (none, this is a leaf)
  • 3 stock assignments (AAPL, MSFT, NVDA)
AAPL and MSFT are also in other portfolios — those assignments stay.
                           [Cancel]   [Delete]
```

## Data

`portfolios` collection (tree nodes):

```
{
  id: string,
  parentId: string | null,
  name: string,
  order: number,                       // within parent
  targetPercent: number | null,        // optional; 0..100
  createdAt: ISO timestamp
}
```

`portfolioAssignments` collection (many-to-many of stock ↔ portfolio):

```
{
  id: string,
  portfolioId: string,                 // leaf or intermediate node
  ticker: string,                      // stock identifier (Phase 2 = stock only)
  targetPercent: number | null,        // per-assignment target (within this portfolio)
  createdAt: ISO timestamp
}
```

## Out of Scope
- Rebalancing suggestions ("you're 2% underweight in Tech — buy X").
- Auto-assignment rules ("every stock whose sector = Tech is in Technology"). All assignments are manual in Phase 2.
- Assignment of non-stock investments (options/bonds/crypto/metals). The schema `ticker` field is expected to extend once those specs land; Phase 2 only stores stocks.
- Sharing / exporting portfolios as a shareable preset. Export is captured by SPEC-016 Data Portability covering portfolios along with everything else.
- Performance tracking against the target at a time-series level (e.g. "you've been 3% underweight Tech for the last 6 months"). Only the current snapshot-vs-target is shown.

## Open Questions
None.
