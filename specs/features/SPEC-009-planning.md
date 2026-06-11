---
id: SPEC-009
name: Planning
status: done
created: 2026-04-08
---

# Planning

## Goal
Give the user a single page where they can plan their future cashflow: what regular and one-time income they expect, where that income should end up (which envelope), and what they intend to spend it on (a structured tree of planned expenses tied to envelopes). The page makes it obvious whether the plan balances — whether planned expenses fit within planned income — and turns the plan into the concrete scheduled transfers that drive day-to-day envelope movements.

Planning answers: "What does my month look like on paper?" and "Am I planning to spend more than I earn?".

## User Stories
- As a user, I can plan my regular monthly incomes so that I know what I expect to receive
- As a user, I can plan one-time incomes so that I capture irregular money I'm expecting
- As a user, I can choose, per income, which envelope it should land in (default: Undistributed income)
- As a user, I understand that planned incomes are scratchpad-only — they are *not* synced to scheduled transfers, because incoming money does not come from another envelope (real income tracking lives in Bills & Income, SPEC-013)
- As a user, I can build a tree of planned expenses and tie each leaf to an envelope so that I know where my money is supposed to go
- As a user, I can enter a planned expense as a yearly, quarterly, or monthly amount and have the other two computed for me
- As a user, I can plan one-time envelope-to-envelope transfers so that occasional reallocations are part of the plan
- As a user, I can see at a glance whether my planned income covers my planned expenses for the period
- As a user, I can keep the income/expense/difference totals visible while scrolling through the plan
- As a user, I can change the time period the plan is displayed in (default monthly)
- As a user, I can see which of my planned items already have active scheduled transfers and which are still pending, so I know what's live vs. what's still a draft
- As a user, I can freely edit planned amounts without affecting active transfers, and only commit changes when I explicitly apply them
- As a user, I can create a parent expense item directly (as a grouping container) without needing to first create a leaf and then add children
- As a user, I can set a day-of-month on each planned expense leaf so the scheduled transfer fires on the day I choose
- As a user, I can hover/tap the sync indicator icons to see a tooltip explaining what they mean
- As a user, I can see each planned expense's share as a percentage of total expenses, so I know my spending priorities at a glance

## Acceptance Criteria

### Page and overall layout
- [x] Planning is a separate page, reachable from the **More menu** as **"Envelope planning"** (the name explicitly contains "Envelope" so it cannot be confused with budget targets or other future planning features)
- [x] The page has two main sections: **Planned incomes** and **Planned expenses** (the list of all scheduled transfers lives on its own page — see SPEC-012)
- [x] A **summary header** is always visible (sticky) while scrolling and shows: total planned income, total planned expenses, and the difference, all for the currently selected period
- [x] The summary header is **visually highlighted in red/warning style** when planned expenses exceed planned income
- [x] A **time-period selector** in the header lets the user view totals as monthly (default), quarterly, or yearly
- [x] Changing the period recalculates all displayed amounts in both sections, not just the summary

### Planned incomes
- [x] User can add a planned income with: name, amount, currency, frequency (one-time | monthly | other regular), target envelope, start date (and end date for regular incomes, optional)
- [x] Target envelope defaults to the built-in **Undistributed income** envelope but the user may pick any envelope
- [x] User can have multiple regular incomes (e.g. salary + side hustle) and multiple one-time incomes
- [x] User can edit or delete any planned income freely (scratchpad — no popups, no automatic transfer/transaction changes)
- [x] **Planned incomes are scratchpad-only.** They do *not* have a "from" envelope and are never converted into scheduled envelope transfers or recurring transactions. They exist purely to feed the income total in the summary header so the user can see whether the plan balances. Real account-level income tracking is done in Bills & Income (SPEC-013).
- [x] Planned incomes therefore have **no sync indicator, no reset button, and no "apply" action** on their rows. The "Apply all transfers" action bar button only operates on planned expenses.

### Planned expenses (tree)
- [x] Planned expenses live in their **own tree** — independent from the Categories tree (SPEC-003)
- [x] User can create planned expense items at the root or nested under any existing item
- [x] Nesting is unlimited in depth
- [x] **Leaf** items can be linked to **exactly one** envelope
- [x] **Parent** items cannot be linked to an envelope
- [x] A leaf item carries: name, envelope, source envelope (default: Undistributed income), currency, amount, frequency (yearly | quarterly | monthly), day of execution, and an "amount basis" — which of the three frequencies the user typed in
- [x] When the user enters or edits the amount on one frequency field, the other two are auto-calculated (yearly = monthly × 12 = quarterly × 4) — auto-calculation triggers on blur, not on every keystroke
- [x] A parent item displays the **sum of all its descendants' amounts** in each column (read-only)
- [x] User can expand/collapse parent items
- [x] User can edit, move, or delete any item
- [x] Deleting a parent prompts a confirmation listing all descendants that will also be deleted (same pattern as SPEC-003 / SPEC-004)

### Converting a leaf into a parent
- [x] When the user adds a child under what was previously a leaf, the leaf's planned amount and any scheduled transfers it generated are deleted
- [x] Before the conversion proceeds, the user is shown exactly what will be deleted (the planned amount, any related scheduled transfers and recurring transactions) and must explicitly confirm
- [x] After confirmation, the item becomes a parent (no envelope link, amount becomes the sum of children) and the conversion proceeds

### Editing amounts (no automatic prompts)
- [x] The planning tool is a **scratchpad**: the user can freely edit any planned income or planned expense amount without triggering popups or modals — changes are reflected immediately in the summary totals so the user can see the income/expense impact
- [x] Edits do **not** automatically create or update scheduled transfers or recurring transactions

### Sync indicators (expenses only)
- [x] Each planned **expense leaf** shows a **sync indicator** when the planned amount differs from the corresponding scheduled envelope transfer (or when no transfer exists yet)
- [x] Each out-of-sync expense row also shows a small **reset icon** that reverts that individual item back to the current transfer amount (or clears the amount if no transfer exists yet)
- [x] Planned incomes do **not** show a sync indicator or reset icon — see "Planned incomes" above

### Applying changes to transfers (expenses only)
- [x] An **action bar** at the bottom of the planning page (below the expense tree) contains two buttons: **"Reset all"** and **"Apply all transfers"**
- [x] **"Apply all transfers"** processes every out-of-sync planned **expense** in one click: creates new scheduled envelope transfers where none exist, and updates existing ones where amounts differ. Planned incomes are skipped entirely.
- [x] **"Reset all"** clears the amount on any unapplied expense and reverts any out-of-sync expense to the current transfer amount. Planned incomes are skipped entirely.
- [x] Before applying, the user is asked once: **"Update the next occurrence only, or the whole series?"** — the chosen option applies to all existing transfers being updated in this batch
- [x] "Next only" creates an override on the next occurrence of each affected transfer and leaves the recurring rules unchanged
- [x] "Whole series" updates each recurring rule from this point forward
- [x] The user can also trigger create/update on a **single expense row** by clicking its sync indicator — the same "next only / whole series" choice is offered for that individual item
- [x] After applying, all sync indicators clear

### Creating parent expense items directly
- [x] The "New planned expense" form includes a checkbox or toggle: **"Group only (no envelope/amount)"**
- [x] When toggled on, the envelope, source envelope, currency, and amount fields are hidden — the user only fills in name and optional parent
- [x] The created item is saved as a parent (envelopeId, sourceEnvelopeId, currency, amount all null)
- [x] A group-only item **never shows the sync indicator or reset icon**, even before it has any children — it cannot have a scheduled transfer
- [x] Children can then be added under it normally

### Day of execution on planned expenses
- [x] Each planned expense leaf carries a **dayOfExecution** field (1–28, default 1)
- [x] The expense form shows a "Day of month" picker for leaf items (same as the income form)
- [x] When "Apply" creates a scheduled transfer for an expense, it uses the expense's dayOfExecution (not hard-coded 1)
- [x] When "Apply" updates an existing scheduled transfer, dayOfExecution changes are also synced

### Sync indicator tooltips
- [x] The ● (sync) icon shows a tooltip on hover: **"Out of sync — click to apply"** when the amount differs from the transfer, or **"Not yet applied — click to create transfer"** when no transfer exists
- [x] The ↺ (reset) icon shows a tooltip on hover: **"Reset to current transfer amount"** (or **"Clear amount"** if no transfer exists)
- [x] On mobile (touch devices), a long-press triggers the tooltip

### Expense percentage column and compact headings
- [x] A new **%** column is added, showing each item's share of total planned expenses for that currency
- [x] Column order in the expense table: **%, YR, QTR, MON** (short headings with tooltips showing full names: "Percentage", "Yearly", "Quarterly", "Monthly")
- [x] For leaf items: percentage = (item monthly amount / total monthly expenses for same currency) × 100
- [x] For parent items: percentage = (parent monthly sum / total monthly expenses for same currency) × 100
- [x] Percentages are displayed to one decimal place (e.g. "14.3%")
- [x] The YR / QTR / MON value columns are formatted to two decimal places with a **comma decimal separator** and a narrow-space thousands separator (e.g. "1 234,00"), via `fmtAmt` from `src/utils/format.js` *(Phase 43g — landed automatically when 43h switched `fmtAmt` to comma; the columns already called `fmtAmt`)*
- [x] On desktop, the value columns and actions column are wide enough that the out-of-sync indicator dot (`●`) never overlaps the MON value
- [x] Each planned-expense row is **highlighted on mouse hover** (subtle full-row background) so that, on a wide desktop screen, the name on the left can be matched to its action buttons on the right. The hover highlight is overridden by the drag-and-drop drop-target backgrounds while dragging.
- [x] The same full-row hover highlight is applied to **planned-income rows** and the **one-time transfer row**, not only expense rows, so all planning rows behave consistently on a wide desktop screen *(Phase 43f)*
- [x] The hover highlight is **clearly visible** against the row background (the Phase 42 expense-row tint was too subtle) *(Phase 43f — solid `#2a3450`, replacing the faint `rgba(148,163,184,0.1)`)*
- [x] The expense form shows Yearly, Quarterly, and Monthly amount fields in a compact row with currency dropdown at the end

### Expense tree collapse / expand *(Phase 45)*
- [x] Clicking anywhere on a parent expense row (except the action buttons) toggles its collapse/expand — the whole row is the toggle target, not only the chevron. *(Phase 45c)*
- [x] The collapsed/expanded state is **persisted** (localStorage `rmoney_planning_expanded`) so returning to the page restores the prior state instead of fully expanding. *(Phase 45d — shared `useCollapseState` hook)*
- [x] A header **Expand all / Collapse all** control toggles every parent expense at once. *(Phase 45d)*

### Amount input behaviour fix
- [x] Typing a number in an amount field must not auto-format with decimals while the user is still typing
- [x] Auto-calculation of the other frequency fields only triggers on blur (when the user leaves the field) — not on every keystroke
- [x] The field the user is actively typing in must never be overwritten by formatting

### One-time envelope transfers
- [x] User can add a **one-time** envelope-to-envelope transfer from the planning page (in addition to the regular ones generated by planned incomes/expenses)
- [x] The transfer form here defaults to **regular** (not one-time) — see SPEC-004 — because most planning-tool transfers are regular, but the user can switch it to one-time
- [x] One-time envelope transfers do not require any account

## UI / Screens

```
PLANNING PAGE
+----------------------------------------------------+
|  <- Planning              Period: [Monthly v]      |
+----------------------------------------------------+
|  Income: 3,000 EUR   Expenses: 2,840 EUR           |  <- sticky summary
|  Difference:  +160 EUR                             |     turns red if negative
+----------------------------------------------------+
|                                                    |
|  PLANNED INCOMES                       [+ Add]     |
|  +----------------------------------------------+  |
|  | Salary               3,000 EUR/mo            |  |
|  | Side hustle            400 EUR/mo            |  |  <- no sync icons: incomes are scratchpad only
|  | Tax refund             800 EUR               |  |
|  +----------------------------------------------+  |
|                                                    |
|  PLANNED EXPENSES                      [+ Add]     |
|  +----------------------------------------------+  |
|  |                          %    Year   Month   |  |
|  |  > Housing             55.8  14,400  1,200   |  |  <- parent (sums)
|  |     Rent               46.5  12,000  1,000   |  |
|  |     Utilities           9.3   2,400    200 ● |  |  <- out of sync (tooltip on hover)
|  |  > Car                 11.6   3,000    250   |  |
|  |     Gasoline            9.3   2,400    200   |  |
|  |     Insurance           2.3     600     50   |  |
|  |  Groceries             18.6   4,800    400 ● |  |  <- not yet applied
|  |  Vacation              14.0   3,600    300   |  |
|  |                                              |  |
|  |  TOTAL               100.0  25,800  2,150    |  |
|  +----------------------------------------------+  |
|                                                    |
|  [↺ Reset all]            [✓ Apply all transfers]  |  <- action bar
+----------------------------------------------------+

Sync indicator key:
  ●   = out of sync (amount differs from transfer, or no transfer exists yet)
  ↺   = reset icon (revert this row to current transfer amount)
  no icon = in sync with existing transfer

PLANNED INCOME FORM
+----------------------------------+
|  New planned income              |
|                                  |
|  Name:        [____________]     |
|  Amount:      [____________] EUR |
|  Frequency:   [ Monthly      v]  |
|  Day:         [ 1            v]  |
|  Lands in:    [ Undistributed v] |  <- envelope, default Undistributed
|  Start date:  [ 2026-05-01    ]  |
|  End date:    [ (optional)    ]  |
|                                  |
|  [Cancel]            [Save]      |
+----------------------------------+

PLANNED EXPENSE FORM (leaf)
+--------------------------------------+
|  New planned expense                 |
|                                      |
|  Name:        [____________]         |
|  Parent:      [ (root)       v]      |
|  [ ] Group only (no amount)          |  <- when checked, hides fields below
|  From:        [ Undistributed v]     |  <- source envelope
|  To:          [ Groceries    v]      |  <- destination envelope
|  Day of month:[ 1            v]      |  <- day the scheduled transfer fires
|                                      |
|  YR         QTR        MON          |
|  [______]   [______]   [______] EUR v|  <- compact row, currency dropdown at end
|                                      |  <- editing one auto-fills the others on blur
|  [Cancel]            [Save]          |
+--------------------------------------+

APPLY TRANSFERS — PROMPT (shown when clicking "Apply all" or a single row's sync indicator)
+----------------------------------+
|  Apply changes to transfers      |
|                                  |
|  3 items will be updated:        |
|    • Side hustle (income)        |
|    • Utilities (expense)         |
|  1 item will be created:         |
|    • Groceries (expense)         |
|                                  |
|  For existing transfers:         |
|  ( ) Next occurrence only        |
|  (o) The whole series            |
|                                  |
|  [Cancel]          [Apply]       |
+----------------------------------+

LEAF → PARENT CONVERSION WARNING
+----------------------------------+
|  Convert "Car" to a parent?      |
|                                  |
|  This will delete:               |
|    • Planned amount: 250 EUR/mo  |
|    • Scheduled transfer:         |
|      Undist → Car 250/mo (1st)   |
|                                  |
|  This cannot be undone.          |
|                                  |
|  [Cancel]      [Convert]         |
+----------------------------------+
```

## Data

Planned income record:
- id
- name: text
- amount: number
- currency: currency code
- frequency: one-time | weekly | monthly | quarterly | yearly | ...
- dayOfExecution: number (for regular — e.g. 20 means the 20th of each month)
- startDate: date (for regular — when this recurring income starts being active; can be a future date)
- endDate: date | null (for regular — when to stop, optional)
- date: date (for one-time — the single date this income occurs)
- envelopeId: id of the envelope the income lands in (default: built-in Undistributed income)
- createdAt: date

*Note: planned incomes have no `linkedScheduledTransferId`. They are scratchpad-only and do not generate scheduled transfers.*

Planned expense item:
- id
- name: text
- parentId: id of parent item, or null if root
- envelopeId: id of destination envelope (required for leaves, must be null for parents)
- sourceEnvelopeId: id of source envelope (default: built-in Undistributed income; required for leaves, must be null for parents)
- currency: currency code (required for leaves, null for parents)
- amountBasis: yearly | quarterly | monthly (which one the user typed in)
- amount: number (in the unit of amountBasis)
- dayOfExecution: number 1–28 (day of month for the scheduled transfer; required for leaves, null for parents; default 1)
- linkedScheduledTransferId: id of the scheduled envelope transfer (SPEC-004) generated by "Apply", or null if not yet applied
- createdAt: date

Derived for planned expense items:
- yearlyAmount, quarterlyAmount, monthlyAmount — computed from `amount` + `amountBasis` for leaves; sum of descendants for parents
- percentOfTotal — item's monthly amount / total monthly expenses for same currency × 100
- isLeaf: true if no children exist
- syncStatus (expense leaves only): "in-sync" if `linkedScheduledTransferId` exists and the transfer amount matches the planned amount; "out-of-sync" if amounts differ; "not-applied" if no linked transfer exists yet

One-time envelope transfer (planning-tool entry point):
- Same shape as the existing envelope transfer record in SPEC-004 — no new data type. The planning tool just calls the same form.

Period summary (derived per displayed period):
- totalPlannedIncome: sum of all planned incomes normalized to the selected period
- totalPlannedExpenses: sum of all planned expense leaves normalized to the selected period
- difference: totalPlannedIncome − totalPlannedExpenses

Sources / cross-references:
- Envelope records and scheduled envelope transfers: SPEC-004

## Out of Scope
- Budget targets per category or per envelope (covered separately in the upcoming `budgets` spec)
- Comparing plan vs. actuals (future — likely a Reports spec)
- Multi-currency planning math (planning is done per currency; cross-currency conversion is a future concern)
- Charts and visualisations of the plan
- Importing a plan from a spreadsheet

## Open Questions
- None.
