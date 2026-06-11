---
id: SPEC-007
name: Envelope List
status: done
created: 2026-04-03
---

# Envelope List

## Goal
Give the user a clear overview of all active envelopes and their balances, with the ability to drill into any envelope to see its full transaction history.
This is the main screen accessible from the Envelopes tab in the bottom nav.

## User Stories
- As a user, I can see all my active envelopes and their balances at a glance
- As a user, I can tap an envelope to see all transactions and transfers related to it
- As a user, I can navigate back from the envelope history to the envelope list
- As a user, I can filter and search the envelope transaction history

## Acceptance Criteria

### Envelope list
- [x] All active envelopes are shown in a flat list with their current balance
- [x] Hierarchical envelopes are visually indented to show parent/child relationships
- [x] Parent envelopes are expandable/collapsible
- [x] Each envelope shows its name and balance
- [x] A parent envelope's balance is the sum of its own balance plus the balances of all its descendants (children, grandchildren, etc.)
- [x] If a parent envelope has a non-zero own balance, it is displayed next to the envelope name alongside the total sum balance
- [x] The own balance uses a visually distinct but secondary style (e.g. smaller, muted) compared to the total sum balance, so the sum remains the dominant figure
- [x] Both the total sum balance and the own balance are color coded: positive amounts in green, negative amounts in red
- [x] Built-in default envelopes ("Undistributed income", "Unassigned expenses") are shown at the top
- [x] Archived envelopes are hidden, viewable via "Show archived" toggle
- [x] A balance that nets to zero within sub-cent floating-point tolerance renders as `0.00`, never `−0.00` (no negative-zero, no spurious minus sign), via the shared `round2` snap *(Phase 43d)*
- [x] The secondary own-balance chip is **not** shown when the own balance is only a sub-cent floating-point residue (i.e. it is treated as exactly zero) *(Phase 43d — `round2(ownBalance)` so the `!== 0` chip test sees exactly 0)*

### Envelope transaction history
- [x] Tapping an envelope opens its transaction history
- [x] History shows: income/expense transactions assigned to this envelope AND envelope transfers in/out
- [x] When the envelope has sub-envelopes, transactions from all descendants (children, grandchildren, etc.) are also included in the history
- [x] Each row shows the name of the envelope it belongs to when viewing an envelope that has sub-envelopes (so the user can tell which sub-envelope a transaction came from)
- [x] Each row shows: date, type, amount, and running envelope balance after that record
- [x] Current envelope balance is displayed as a header at the top of the history, and updates immediately after any record is added, edited, or deleted without leaving the screen
- [x] Transactions are listed newest first by default
- [x] User can toggle sort order (newest/oldest first)

### Filtering and search (within envelope history)
- [x] User can filter by: type (income/expense/transfer), category, account, payee, amount range, date range
- [x] Multiple filters can be active at the same time
- [x] Active filters are visually indicated with a "Clear filters" button
- [x] User can search by note text
- [x] Search and filters work together

### Creating a transfer from envelope history
- [x] The envelope history screen has a "Transfer" button that opens the envelope transfer form (from SPEC-004)
- [x] When opened from envelope history, the transfer form's "From" field defaults to the envelope being viewed (overriding the global default of "Undistributed income")

### Editing records
- [x] Tapping a transaction row opens it for editing (uses Transaction Entry form from SPEC-005)
- [x] Tapping an envelope transfer row opens the envelope transfer form for editing (from SPEC-004)
- [x] On desktop, rows highlight on hover with pointer cursor to indicate they are tappable
- [x] The edit form includes a Delete button (red, requires confirmation dialog before deleting)
- [x] On the desktop split layout (tree pane + detail pane), adding, editing, or deleting a record in the right-hand detail pane immediately refreshes the **left-hand tree balances** — including parent/total sums — without the user having to select another envelope first *(Phase 43e; the detail pane signals the parent list via an `onDataChange` callback, wired from `Envelopes` to both `EnvelopeHistory` instances)*

### Collapse / expand interaction *(Phase 45)*
- [x] **Single-click** anywhere on an envelope row (except the action buttons) opens that envelope's detail/history — extended from the name-only click to the whole row. *(Phase 45a — a short click-delay lets a double-click cancel the pending open.)*
- [x] **Double-click** a parent row, or click the **left chevron button**, toggles that envelope's collapse/expand. (Leaf rows have no chevron and no collapse.) *(Phase 45a)*
- [x] The collapsed/expanded state is **persisted** (localStorage `rmoney_envelopes_collapsed`) so returning to the page restores the prior state instead of fully expanding. *(Phase 45b — shared `useCollapseState` hook)*
- [x] A header **Expand all / Collapse all** control toggles every parent envelope at once. *(Phase 45b)*

### Navigation
- [x] A back button returns the user from envelope history to the envelope list
- [x] Bottom nav remains visible throughout

## UI / Screens

```
ENVELOPE LIST (Envelopes tab)
+------------------------------------------+
|  Envelopes                               |
+------------------------------------------+
|  Undistributed income         1,200 EUR  |  <- green (positive)
|  Unassigned expenses           -340 EUR  |  <- red (negative)
|                                          |
|  > Vacation          +50  [800 EUR]      |  <- own balance +50 (green, muted)
|      Summer 2026              500 EUR    |     total sum 800 (green, dominant)
|      Winter ski trip          300 EUR    |
|  > Home                      [450 EUR]   |  <- no own balance, only total shown
|      Electricity              150 EUR    |
|      Repairs                  300 EUR    |
|  New bicycle                  120 EUR    |
|                                          |
|  [Show archived]                         |
+------------------------------------------+
| Dashboard | Envelopes | [+] | Categories | Transactions |
+------------------------------------------+

Color coding key:
  total sum balance — bold, green (positive) / red (negative)
  own balance       — smaller/muted, green (positive) / red (negative), only shown when non-zero

ENVELOPE TRANSACTION HISTORY (leaf envelope — no sub-envelopes)
+------------------------------------------+
|  <- Summer 2026                          |
|                                          |
|  Balance: 500.00 EUR                     |
+------------------------------------------+
|  [Filter] [Q]                            |
+------------------------------------------+
|  Date     Description       Amount   Bal |
+------------------------------------------+
|  15 Mar   Transfer in       +200    500  |
|           from Undistributed             |
|  01 Mar   Expense            -50    300  |
|           Train tickets                  |
|  15 Feb   Transfer in       +200    350  |
|           from Undistributed             |
+------------------------------------------+
| Dashboard | Envelopes | [+] | Categories | Transactions |
+------------------------------------------+

ENVELOPE TRANSACTION HISTORY (parent envelope — includes sub-envelope transactions)
+------------------------------------------+
|  <- Vacation                             |
|                                          |
|  Balance: 800.00 EUR                     |
+------------------------------------------+
|  [Filter] [Q]                            |
+------------------------------------------+
|  Date   Envelope       Description  Amt  |
+------------------------------------------+
|  15 Mar Summer 2026    Transfer in  +200  |
|                        from Undist.      |
|  10 Mar Winter ski     Expense       -80  |
|                        Ski pass          |
|  01 Mar Summer 2026    Expense       -50  |
|                        Train tickets     |
|  15 Feb Winter ski     Transfer in  +300  |
|                        from Undist.      |
+------------------------------------------+
| Dashboard | Envelopes | [+] | Categories | Transactions |
+------------------------------------------+
```

## Data
This screen reads data — it does not create or modify its own data.

Sources:
- Envelope records (from SPEC-004)
- Transaction records assigned to the envelope (from SPEC-005)
- Envelope transfer records (from SPEC-004)

Derived:
- envelopeBalance: sum of all transfers in minus transfers out, plus income assigned to envelope minus expenses assigned to envelope
- For parent envelopes, envelopeBalance is the recursive sum of the envelope's own balance plus all descendant balances
- runningBalance: envelope balance after each record in chronological order
- For parent envelopes, the transaction list is the union of all records from the envelope and all its descendants, sorted by date; each record carries its source envelope name for display

## Out of Scope
- Creating or editing envelopes from this screen (handled in SPEC-004)
- Scheduled transfers and projections (shown in envelope detail, covered in SPEC-004)
- Grouping by time period

## Open Questions
- None.
