---
id: SPEC-006
name: Transaction List
status: done
created: 2026-04-03
---

# Transaction List

## Goal
Allow the user to browse, search, and filter their transaction history.
This is the primary screen for reviewing what has been recorded and understanding money flow over time.

## User Stories
- As a user, I can see all my transactions in a flat list so that I can review my financial activity
- As a user, I can filter transactions so that I can focus on specific accounts, categories, or time periods
- As a user, I can search transactions by note so that I can find specific entries
- As a user, I can see the running balance when viewing a single account so that I know the account state at any point in time

## Acceptance Criteria

### List display
- [x] Transactions are shown in a flat list, newest first by default. **Within the same date, the most recently entered transaction sorts first** (date desc, then `createdAt` desc — Phase 49a), so the last entry for a date appears at the top of that date
- [x] Each transaction row shows: date, type icon (income/expense/transfer), amount, currency, account, category, payee
- [x] Non-transfer rows also show the transaction's **envelope as its full ancestor path** (`◇ Household › Food › Groceries`, separator `›` — Phase 49e), resolved even for archived envelopes
- [x] Income is shown in green, expenses in red, transfers in neutral colour
- [x] Tapping a transaction row opens it for editing (uses Transaction Entry form)
- [x] On desktop, rows highlight on hover with pointer cursor to indicate they are tappable
- [x] The edit form includes a Delete button (red, requires confirmation dialog before deleting)
- [x] Tapping an account transfer opens the transfer form for editing

### Filtering
- [x] User can filter by account using quick-filter buttons (All + one per account) always visible above the filter panel
- [x] User can filter by: category, envelope, type (income/expense/transfer), payee, amount range, date range
- [x] Filtering by a parent category includes all its sub-categories and leaf categories
- [ ] When the type filter is set to **Income**, the category filter dropdown shows only income categories; when set to **Expense**, only expense categories; when no type filter is active (or Transfer is selected), all categories are shown grouped by type (Income / Expense)
- [x] Filtering by a parent envelope includes all its child envelopes
- [x] Multiple filters can be active at the same time
- [x] Active filters are visually indicated
- [x] A "Clear filters" button resets all filters

### Search
- [x] User can search transactions by note text
- [x] Search and filters work together (search results are also filtered)

### Running balance
- [x] When filtered to a single account, each transaction row also shows the account balance after that transaction
- [x] Running balance is calculated from the starting balance of the account plus all transactions up to that row
- [x] Running balance column is hidden when viewing all accounts or multiple accounts

### Sorting
- [x] Default sort: newest first
- [x] User can toggle sort order (newest/oldest first)

## UI / Screens

```
TRANSACTION LIST (all accounts)
+------------------------------------------+
|  Transactions                    [⚙] [↓] |  <- ⚙=filter toggle (tooltip: "Filter"), ↓=sort toggle (tooltip: "Sorted: newest/oldest first")
+------------------------------------------+
|  Active filters: Expense, Car/*     [x]  |  <- clear filters
+------------------------------------------+
|  03 Apr  Expense   -45.00 EUR            |
|          Daily Card  Car/Gasoline        |
|          Gas Station XYZ                 |
|  02 Apr  Income  +3,000.00 EUR           |
|          Main Account  Employment/Salary |
|          Employer Inc.                   |
|  01 Apr  Transfer  500.00 EUR            |
|          Savings -> Daily Card           |
|  31 Mar  Expense   -12.99 EUR            |
|          Daily Card  Subscriptions/Netflix|
|          Netflix                         |
+------------------------------------------+

TRANSACTION LIST (single account — with running balance)
+------------------------------------------+
|  Transactions                    [⚙] [↓] |
+------------------------------------------+
|  Active filters: Daily Card         [x]  |
+------------------------------------------+
|  Date     Description       Amount   Bal  |
+------------------------------------------+
|  03 Apr   Car/Gasoline     -45.00   795  |
|  01 Apr   <- Savings      +500.00   840  |
|  31 Mar   Netflix          -12.99   340  |
|  28 Mar   Groceries        -35.00   353  |
+------------------------------------------+

ACCOUNT BUTTONS (always visible)
+------------------------------------------+
|  [All]  [Daily Card]  [Savings]  [Cash]  |
+------------------------------------------+

FILTER PANEL (expandable via ⚙ button)
+----------------------------------+
|  [Type v]  [Payee              v]        |
|  [Category         v] [Envelope v]       |
|  Amount:   [min] — [max]                 |
|  Date:     [from] — [to]                 |
|  [Clear all]                             |
+----------------------------------+
```

## Data
This screen reads transaction data — it does not create or modify its own data.
All data comes from the Transaction Entry spec (SPEC-005).

Derived:
- runningBalance: for single-account view, calculated as account.startingBalance + sum of all transactions up to and including the current row, in chronological order

## Out of Scope
- Exporting transactions to CSV/PDF (future)
- Charts or visual summaries (covered in Dashboard spec)
- Bulk editing or deleting transactions (future)
- Grouping by day/week/month (flat list only for MVP)

## Open Questions
- None.
