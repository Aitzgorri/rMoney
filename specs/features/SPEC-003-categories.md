---
id: SPEC-003
name: Categories
status: done
created: 2026-04-03
---

# Categories

> **Phase 46 (2026-06-12):** the standalone **Categories page was removed** — it only duplicated the category tree shown on Category Budgets. All category **management UI** (create / rename / delete / add-subcategory / drag-reparent / archive-built-in) now lives on the merged **Categories & budgets** screen ([SPEC-011](SPEC-011-budgets.md)). This spec remains the source of truth for the **category data model, default/built-in categories, and the hierarchical/type-filtered dropdown conventions** (all unchanged); only the page that hosted the management UI moved. No information was lost.

## Goal
Allow the user to classify every transaction by what it was for (expense) or where it came from (income).
Categories are hierarchical and user-defined, giving flexible organisation without any forced structure.

## User Stories
- As a user, I can create an income or expense category so that I can classify my transactions
- As a user, I can nest categories under a parent so that I can organise them hierarchically
- As a user, I can edit a category name so that I can correct mistakes
- As a user, I can delete a category and confirm that all its sub-categories will also be deleted

## Acceptance Criteria
- [x] Categories are strictly separated into two independent trees: Income and Expense
- [x] A category can be created at the root level or under any existing category of the same type
- [x] Nesting is unlimited in depth (e.g. Car / Charges / Highway / Toll A)
- [x] User can edit the name of any category
- [x] Deleting a category that has sub-categories shows a warning listing all affected sub-categories
- [x] Deletion proceeds only after the user explicitly confirms
- [x] Deleting a category removes it and all its sub-categories
- [x] Categories screen shows Income and Expense trees in two separate tabs or sections
- [x] Each tree is expandable/collapsible per parent category
- [x] A category with no parent is a root category (e.g. "Car", "Employment")
- [x] **Favorite categories (Phase 48):** because categories are strictly split by type, favorites are managed as **two separate lists** — **Settings → General → Favorite income categories** and **Favorite expense categories** (each drag-to-reorder + search-to-add + remove, scoped to its type's tree). Stored as category IDs in `rmoney_settings.favoriteIncomeCategories` / `favoriteExpenseCategories`; in Phase 51 each list surfaces at the top of the matching type's category picker, never mixing income and expense (consistent with the cross-spec type-filtering rule below)

### Category type filtering in dropdowns (cross-spec rule)
- [ ] Any dropdown or select that lists categories **must only show categories matching the context type** — income categories for income contexts, expense categories for expense contexts
- [ ] Income categories must never appear in an expense context and vice versa — cross-type selection is not allowed
- [ ] The only exception is screens that explicitly work with both types at once (e.g. the Category Budgets form, the Transaction List category filter when no type filter is active) — these show all categories, clearly grouped or labelled by type
- [ ] This rule applies everywhere without exception: transaction entry, planned items (Bills & Income), category budget form when a type context is known, and any future screen that adds a category picker

## UI / Screens

```
CATEGORIES SCREEN
+----------------------------------+
|  Categories                      |
|  [ Income ]  [ Expense ]         |  <- tab switcher
+----------------------------------+
|  EXPENSE                         |
|                                  |
|  > Car                  [+ ] [x] |  <- expandable, add child, delete
|    > Charges            [+ ] [x] |
|        Highway          [+ ] [x] |
|    Gasoline             [+ ] [x] |
|  > Food                 [+ ] [x] |
|    Groceries            [+ ] [x] |
|    Restaurants          [+ ] [x] |
|                                  |
|  [+ Add root category]           |
+----------------------------------+

DELETE WARNING DIALOG
+----------------------------------+
|  Delete "Car"?                   |
|                                  |
|  This will also delete:          |
|    • Charges                     |
|        • Highway                 |
|    • Gasoline                    |
|                                  |
|  This cannot be undone.          |
|                                  |
|  [Cancel]          [Delete all]  |
+----------------------------------+
```

## Data

Category record:
- id (unique identifier, generated automatically)
- type: income | expense
- name: text
- parentId: id of parent category, or null if root
- createdAt: date

Derived:
- children: all categories where parentId = this id (recursive)
- fullPath: e.g. "Car / Charges / Highway"

## Out of Scope
- Default / built-in categories (user builds from scratch)
- Archiving categories (delete only)
- Shared categories between users (future)
- Assigning a colour or icon to categories (future)

## Open Questions
- None.
