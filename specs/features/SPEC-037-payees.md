---
id: SPEC-037
name: Payees
status: ready
created: 2026-06-10
---

# Payees

## Goal
Give payees a first-class home: a **Payee report** under "More" where the user can see every payee, drill into that payee's transactions, and **manage** payees (rename, merge, delete) — fixing the fact that today a payee is just a free-text string scattered across transactions with no way to correct a typo or consolidate duplicates. Complements the in-form autocomplete improvements in SPEC-005.

## User Stories
- As a user, I can open a Payees page from "More" and see all my payees with how much I've paid to / received from each.
- As a user, I can expand a payee to see its individual transactions, filtered to a date range, amount range, currency, envelope, account, or category.
- As a user, I can rename a payee (e.g. fix a typo) and have every transaction using it update at once.
- As a user, when I rename a payee to a name that already exists, I'm warned that the two will be merged and must approve before it happens.
- As a user, I can delete a payee — after a warning — and the transactions that used it are left with no payee rather than being deleted.

## Background — data model
Payees are stored as a free-text `payeeName` **string** on each transaction (SPEC-005), not as an id reference. A separate `rmoney_payees` registry (`{ id, name, createdAt }`) is auto-populated by `savePayee` whenever a transaction is saved. Bills & Income **planned items** (SPEC-013) also carry a `payee` string, and auto-apply copies it onto the transactions they create. This spec therefore treats payees by **normalized name** (trimmed + case-folded) and, on every management action, rewrites both transaction `payeeName` and planned-item `payee`, keeping the registry in sync. There is **no migration to id-based payees** — the string model is kept deliberately.

## Acceptance Criteria

### Navigation & screen
- [ ] A new **Payees** entry appears under "More" in both navigations: the mobile `BottomNav` more-menu and the desktop `TopNav` More sub-row (per SPEC-015). Selecting it opens the Payees screen via a new `payees` route in `App.jsx`.
- [ ] The screen widens to fill the desktop container (no multi-column rework required); mobile is single-column.

### Payee report — list & filters
- [ ] The report defaults to the **last 12 months** of transactions.
- [ ] Filters: **date from / until**, **amount range** (min / max), **currency**, **envelope**, **account**, **category**. Multiple filters combine; a "Clear filters" affordance shows when any filter is active.
- [ ] Envelope and category filter dropdowns are **hierarchical** (`getEnvelopesFlat` / `getCategoriesFlat` + `INDENT`). Because the report spans income and expense, the category filter is a both-type context and shows disabled **Income** / **Expense** section headers (per the CLAUDE.md dropdown conventions).
- [ ] The amount-range filter acts on the raw transaction amount; combined with the currency filter it is unambiguous across currencies.
- [ ] The report lists **all payees** found in the (filtered) transactions. Payees are grouped by a **normalized key** (trimmed + case-insensitive); the displayed name is the most common original spelling for that key.
- [ ] Only income/expense transactions are considered (transfers have no payee and are excluded).
- [ ] Transactions with an empty payee are grouped under a **"(no payee)"** bucket; the system default **"Unspecified payee"** appears as its own bucket.
- [ ] Each payee row is **expandable / collapsible** to reveal its transactions (date, type, amount + currency, account, category, note), newest first.

### Per-payee summary *(enhancement E1)*
- [ ] Each payee row shows summary figures: **total paid**, **total received**, **transaction count**, and **last-used date**, broken down per currency. (Delivers the SPEC-005 "total received from / total paid to a payee" criterion, which had no UI.)

### Sort & search *(enhancement E4)*
- [ ] The report has a **search box** to filter the payee list by name and a **sort** control (most spent / most frequent / name).

### Edit a transaction from the report *(enhancement E2)*
- [ ] Clicking a transaction inside an expanded payee opens it in the standard transaction edit form (SPEC-005), including its Delete action. On save/delete the report refreshes.

### Payee management — rename / merge / delete
- [ ] The user can **rename** a payee. On save, the change is applied to the `rmoney_payees` record, every transaction whose payee matches (normalized), **and** every Bills & Income planned item whose payee matches.
- [ ] If the new name matches an existing payee (normalized), the app **warns that the two payees will be merged** and requires approval. On approval it **merges**: all transactions and planned items under the old name are rewritten to the target name and the old registry record is removed.
- [ ] The user can **delete** a payee. A confirmation warning is shown and the user must approve. On approval, every matching transaction and planned item is left **payee-less** (empty payee — the records are **not** deleted), and the registry record is removed.
- [ ] The system default **"Unspecified payee"** bucket cannot be renamed or deleted.

### Shared autocomplete component *(enhancement E3)*
- [ ] The payee autocomplete (SPEC-005) is extracted into a single reusable component and used by: the transaction form, the report's payee-related inputs, and the Envelope History payee filter (SPEC-007).

### Storage registration
- [ ] A **Payees** card is added to **Settings → Storage** (SPEC-026) showing the `rmoney_payees` size and count (closing a pre-existing gap; this collection was never registered).

## UI / Screens

```
PAYEES (More → Payees)
+------------------------------------------------------------+
|  Payees                                                    |
|  [ search payees… ]            sort: [ Most spent ▼ ]      |
|  From [2025-06-10] Until [2026-06-10]  Amount [__]-[__]    |
|  Currency [All ▼]  Account [All ▼]  Envelope [All ▼]       |
|  Category [All ▼]                         [Clear filters]  |
+------------------------------------------------------------+
|  ▸ Acme Corp          24 txns · last 2026-05-30           |
|        paid 1 240,00 EUR · received 0,00 EUR    [✎] [🗑]   |
|  ▾ Landlord            12 txns · last 2026-06-01           |
|        paid 9 000,00 EUR · received 0,00 EUR    [✎] [🗑]   |
|        2026-06-01  -750,00 EUR  Checking · Rent           |
|        2026-05-01  -750,00 EUR  Checking · Rent           |
|        …                                                   |
|  ▸ (no payee)          3 txns                              |
|  ▸ Unspecified payee   8 txns                              |
+------------------------------------------------------------+

RENAME → MERGE WARNING
+--------------------------------------------+
|  "Acme" already exists as "ACME Corp".     |
|  Renaming will MERGE them into "ACME Corp": |
|  24 transactions + 1 recurring item move.   |
|  This cannot be undone.                      |
|              [Cancel]        [Merge]         |
+--------------------------------------------+

DELETE WARNING
+--------------------------------------------+
|  Delete payee "Acme Corp"?                  |
|  24 transactions + 1 recurring item will    |
|  be left with no payee. Records are kept.   |
|              [Cancel]        [Delete]        |
+--------------------------------------------+
```

## Data
- **Reads:** transactions (SPEC-005), Bills & Income planned items (SPEC-013), accounts (SPEC-002), categories (SPEC-003), envelopes (SPEC-004), `rmoney_payees`.
- **Writes:** `transaction.payeeName`, `plannedItem.payee`, and `rmoney_payees` records (on rename / merge / delete).
- **No new collection** and **no backup-format change** — `rmoney_payees` is already exported (SPEC-016). The Settings → Storage card surfaces the existing collection.
- Normalization: payee grouping/matching uses `name.trim().toLowerCase()` as the key throughout.

## Out of Scope
- Migrating transactions to an id-based payee reference (the free-text string model is kept).
- Payee-level rules/automation (auto-categorisation by payee, default envelope per payee) — possible future work.
- Importing/exporting payees as a standalone file (covered by the full JSON backup).
- Merging payees by multi-select in bulk (merge happens only as a side effect of a rename collision in this spec).

## Open Questions
- None (scope confirmed with the user 2026-06-10).
