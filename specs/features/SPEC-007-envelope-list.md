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
- [x] The envelope history screen has a "Transfer" button that opens the envelope transfer form (from SPEC-004) — labelled **"⇄ Transfer"** (icon + text, Phase 54c), with a tooltip
- [x] When opened from envelope history, the transfer form's "From" field defaults to the envelope being viewed (overriding the global default of "Undistributed income")
- [x] The **left tree-pane "⇄ Transfer" button** also prefills From with the currently selected envelope when one is selected *(Phase 54c — previously it always fell back to Undistributed income, inconsistent with the detail-pane button)*

### Header button polish
- [x] Neither **"⇄ Transfer"** button ever wraps its label onto two lines: the envelope-list header button gets `white-space: nowrap` + `flex-shrink: 0`, and the **detail-pane header** button — which had inherited the fixed **36px icon-square** style and squeezed "⇄ Transfer" onto two rows — sizes to its content (`width: auto` + padding + nowrap) *(Phase 61a — bug from the 10 Jul 2026 notes; the detail-pane button was the one in the user's screenshot)*

### Detail-pane header polish *(Phase 54c)*
- [x] The ⚙ filter toggle and the ↓/↑ sort toggle carry `title` tooltips (tooltip rule, CLAUDE.md 2026-07-08)
- [x] A **÷ daily-spend toggle** sits between the Transfer and filter buttons: when on, the Balance row also shows **balance ÷ days remaining in the current planning period** ("X,XX / day · N days left in period") — the same formula as the Dashboard daily-spending widget (SPEC-008), computed on the envelope's total (incl. descendants) balance

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

### Scheduled transfers + projection panel *(Phase 50)*
- [x] The envelope detail pane lists the **scheduled transfers** touching this envelope **or any of its descendants** — a parent envelope shows its sub-envelopes' transfers too *(Phase 61b rework; originally the envelope only, Phase 50a)*. The section header is a **collapse toggle** (chevron + count badge); it is **collapsed by default** and the state persists globally (`rmoney_envelopes_scheduled_expanded`, via the shared `useCollapseState` hook) *(Phase 50a)*
- [x] When the envelope has scheduled transfers, the section header shows their **net sum per frequency** over the raw amounts (e.g. "Weekly +50,00 · Monthly +200,00 · Yearly −1 200,00", colored by sign, in the shared frequency order). An **approximate monthly average** ("≈ ±X/mo" = yearly-equivalent total ÷ 12, via the shared `monthlyEquivalent`) is appended **only when a non-monthly frequency exists** — an all-monthly set IS a per-month figure and gets no ≈. Transfers internal to the family (both sides inside) move nothing across its boundary and are excluded from the sums. Computed by `scheduledTransfersSummary` in `data/envelopes.js` (unit-tested) *(Phase 61b, display refined per user feedback 2026-07-10 — supersedes the earlier in/out monthly-equivalent design of decision P3)*
- [x] Scheduled rows are **ordered by scheduled day**: day-of-month rules (monthly/quarterly/yearly) first by day 1–28 — so the 1st appears at the top regardless of frequency — then weekday rules (weekly/bi-weekly) by weekday *(Phase 50b)*
- [x] Each row reads **Day · Frequency · Amount · counterpart-envelope · ›**, on a single row on desktop (wraps on narrow screens) *(Phase 50c)*
- [x] **Envelope names in scheduled rows use the compact "Parent / Leaf" form** — only the **last two** path segments, never higher ancestors (e.g. "SubEnvelope / LastEnvelope") *(Phase 61b rework)*. When viewing a parent, a row belonging to a sub-envelope carries a **tag naming that sub-envelope** (same Parent/Leaf form; hidden when the transfer belongs to the viewed envelope itself). Direction is relative to the whole family: incoming = green +, outgoing = red −, and a transfer **between two family members renders neutral** ("From ⇄ To", unsigned) since it moves nothing in or out
- [x] The 6-month **projection** figures lay out on **one row on desktop** (wrapping on mobile) and render through the central `fmtAmt` formatter *(Phase 50d)*
- [x] **Projection calculation (Phase 52):** each month is forecast as `B(N) = B(N-1) + R + A + O(N)`, over the envelope **and its descendants** (matching the displayed total balance):
  - **R** — recurring scheduled monthly net: scheduled envelope transfers (in/out) **and** recurring Bills & Income planned items tagged to the scope, each converted to a **monthly equivalent** (`weekly ×52/12`, `bi-weekly ×26/12`, `monthly ×1`, `quarterly ÷3`, `yearly ÷12`)
  - **A** — average of **unscheduled** actual flows over the **last 3 complete calendar months** (÷ the months of history available, capped at 3); schedule-generated actuals (`isScheduled` transfers, `isPlanned` transactions — incl. confirmed occurrences per SPEC-013) are excluded so nothing is double-counted
  - **O(N)** — one-time future scheduled items (future-dated one-time planned items + one-time envelope transfers) placed in their specific month
- [x] A caption under the projection explains it: "scheduled net ±X/mo · avg unscheduled ±Y/mo · based on N mo". The panel hides when there is nothing to project *(Phase 52d)*

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
